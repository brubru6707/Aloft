import { INPUT } from '../config';
import { AngleFilter, clamp, deadzone, wrapDeg } from './filter';
import { Emitter, type GloveEvents, type GloveSample, type GloveSource, type RawSample, type SourceKind, type SourceStatus } from './types';

/**
 * One glove slot. Wraps whichever source is attached (BLE or simulator), applies
 * smoothing / recentering / deadzone, and turns raw button levels into
 * press / release / tap / holdstart / holdend events.
 */
export class GloveInput extends Emitter<GloveEvents> {
  readonly state: GloveSample;
  /** Smoothed, recentered, inverted-per-config orientation BEFORE the global deadzone/clamp. */
  private smoothed = { roll: 0, pitch: 0, yaw: 0 };
  /** Read-only view of the smoothed orientation, for modes that apply their own deadzone (FLY). */
  get tilt(): Readonly<{ roll: number; pitch: number; yaw: number }> { return this.smoothed; }
  private rawLatest = { roll: 0, pitch: 0, yaw: 0 };
  private offset = { roll: 0, pitch: 0, yaw: 0 };
  private filters = [new AngleFilter(INPUT.smoothing), new AngleFilter(INPUT.smoothing), new AngleFilter(INPUT.smoothing)];
  private pressedAt: (number | null)[] = [null, null, null, null];
  private holdFired = [false, false, false, false];
  private rawDown = [false, false, false, false];
  private checkTimer: ReturnType<typeof setInterval> | null = null;
  /** Auto-recenter schedule after a connect: on the first sample, then again once settled. */
  private recenterOnSample = false;
  private settleRecenterAt = 0;

  source: GloveSource | null = null;
  status: SourceStatus = 'disconnected';
  statusDetail = '';
  lastSampleAt = 0;

  constructor(readonly gloveId: number) {
    super();
    this.state = { gloveId, roll: 0, pitch: 0, yaw: 0, buttons: [false, false, false, false] };
  }

  get connected(): boolean { return this.status === 'connected'; }
  get sourceKind(): SourceKind | null { return this.source?.kind ?? null; }
  /** Raw button level (true while physically held), independent of tap/hold classification. */
  isDown(button: number): boolean { return this.rawDown[button] ?? false; }
  /** True once a press has lasted longer than the tap threshold and is still down. */
  isHeld(button: number): boolean { return this.rawDown[button] && this.holdFired[button]; }

  async attach(source: GloveSource): Promise<void> {
    this.detach();
    this.source = source;
    source.onStatus((status, detail) => {
      this.status = status;
      this.statusDetail = detail ?? '';
      if (status !== 'connected') this.resetButtons();
      if (status === 'connected') {
        // Whatever pose the hand is in at connect time becomes zero roll/pitch/yaw.
        this.recenterOnSample = true;
        this.settleRecenterAt = performance.now() + INPUT.connectSettleMs;
      }
      this.emit('status', { gloveId: this.gloveId, status, source: source.kind, detail });
    });
    source.onSample((s) => this.ingest(s));
    this.filters.forEach((f) => f.reset());
    this.checkTimer = setInterval(() => this.checkHolds(performance.now()), 20);
    await source.connect();
  }

  detach(): void {
    if (this.source) {
      const kind = this.source.kind;
      this.source.disconnect();
      this.source = null;
      this.status = 'disconnected';
      this.statusDetail = '';
      this.emit('status', { gloveId: this.gloveId, status: 'disconnected', source: kind });
    }
    if (this.checkTimer !== null) clearInterval(this.checkTimer);
    this.checkTimer = null;
    this.resetButtons();
  }

  /** Zero the current orientation. */
  recenter(): void {
    this.offset = { ...this.rawLatest };
    this.filters.forEach((f) => f.reset());
    this.smoothed = { roll: 0, pitch: 0, yaw: 0 };
    this.state.roll = this.state.pitch = this.state.yaw = 0;
  }

  private resetButtons(): void {
    for (let b = 0; b < 4; b++) {
      if (this.rawDown[b]) this.release(b, performance.now());
    }
    this.rawDown = [false, false, false, false];
    this.state.buttons = [false, false, false, false];
  }

  private ingest(s: RawSample): void {
    this.lastSampleAt = s.timestamp;
    this.rawLatest = { roll: s.roll, pitch: s.pitch, yaw: s.yaw };
    this.emit('raw', s);
    if (this.recenterOnSample || (this.settleRecenterAt && s.timestamp >= this.settleRecenterAt)) {
      // First sample after connect: zero immediately. Once more after the settle time, when the
      // glove's own filter has converged, so the resting pose is exactly 0/0/0.
      if (this.recenterOnSample) this.recenterOnSample = false; else this.settleRecenterAt = 0;
      this.recenter();
      this.emit('recentered', { gloveId: this.gloveId });
    }

    const r0 = wrapDeg(s.roll - this.offset.roll) * (INPUT.invertRoll ? -1 : 1);
    const p0 = wrapDeg(s.pitch - this.offset.pitch) * (INPUT.invertPitch ? -1 : 1);
    const y0 = wrapDeg(s.yaw - this.offset.yaw);
    this.smoothed.roll = this.filters[0].push(r0);
    this.smoothed.pitch = this.filters[1].push(p0);
    this.smoothed.yaw = this.filters[2].push(y0);

    const max = INPUT.maxTiltDeg;
    this.state.roll = deadzone(clamp(this.smoothed.roll, -max, max), INPUT.deadzoneDeg, max);
    this.state.pitch = deadzone(clamp(this.smoothed.pitch, -max, max), INPUT.deadzoneDeg, max);
    this.state.yaw = this.smoothed.yaw;

    for (let b = 0; b < 4; b++) {
      const down = s.buttons[b];
      if (down && !this.rawDown[b]) this.press(b, s.timestamp);
      else if (!down && this.rawDown[b]) this.release(b, s.timestamp);
    }
    this.checkHolds(s.timestamp);
    this.emit('sample', { ...this.state, buttons: [...this.state.buttons] as GloveSample['buttons'] });
  }

  private press(b: number, t: number): void {
    this.rawDown[b] = true;
    this.state.buttons[b] = true;
    this.pressedAt[b] = t;
    this.holdFired[b] = false;
    this.emit('press', { gloveId: this.gloveId, button: b });
  }

  private release(b: number, t: number): void {
    this.rawDown[b] = false;
    this.state.buttons[b] = false;
    const start = this.pressedAt[b];
    this.pressedAt[b] = null;
    this.emit('release', { gloveId: this.gloveId, button: b });
    if (start === null) return;
    if (this.holdFired[b]) this.emit('holdend', { gloveId: this.gloveId, button: b });
    else if (t - start < INPUT.tapMaxMs) this.emit('tap', { gloveId: this.gloveId, button: b });
    this.holdFired[b] = false;
  }

  private checkHolds(now: number): void {
    for (let b = 0; b < 4; b++) {
      const start = this.pressedAt[b];
      if (start !== null && !this.holdFired[b] && now - start >= INPUT.tapMaxMs) {
        this.holdFired[b] = true;
        this.emit('holdstart', { gloveId: this.gloveId, button: b });
      }
    }
  }
}
