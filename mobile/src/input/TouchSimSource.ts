import { SIM } from '../config';
import { clamp, wrapDeg } from './filter';
import type { GloveSource, RawSample, SourceStatus } from './types';

/**
 * Touch glove simulator (mobile replacement for the keyboard/mouse one).
 *  - one-finger drag on the 3D view: roll (dx) / pitch (dy), springs back to level on release
 *  - two-finger horizontal drag: yaw (does not spring back)
 *  - on-screen buttons 1-4: B0-B3 (hold = held)
 * The UI feeds it through dragTilt / dragYaw / setButton; it emits samples at SIM.hz.
 */
export class TouchSimSource implements GloveSource {
  readonly kind = 'sim' as const;
  readonly name = 'Simulator';

  private roll = 0;
  private pitch = 0;
  private yaw = 0;
  private buttons: [boolean, boolean, boolean, boolean] = [false, false, false, false];
  private dragging = false;
  private dragStart = { roll: 0, pitch: 0 };
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;
  private sampleCb: ((s: RawSample) => void) | null = null;
  private statusCb: ((s: SourceStatus, d?: string) => void) | null = null;

  onSample(cb: (s: RawSample) => void): void { this.sampleCb = cb; }
  onStatus(cb: (s: SourceStatus, d?: string) => void): void { this.statusCb = cb; }

  async connect(): Promise<void> {
    this.lastTick = performance.now();
    this.timer = setInterval(this.tick, 1000 / SIM.hz);
    this.statusCb?.('connected', 'touch simulator');
  }

  disconnect(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.buttons = [false, false, false, false];
    this.dragging = false;
    this.statusCb?.('disconnected');
  }

  /** One-finger drag began. */
  beginDrag(): void {
    this.dragging = true;
    this.dragStart = { roll: this.roll, pitch: this.pitch };
  }
  /** One-finger drag: total offset from where the finger went down (px). */
  dragTilt(dx: number, dy: number): void {
    if (!this.dragging) this.beginDrag();
    this.roll = clamp(this.dragStart.roll + dx * SIM.touchDegPerPixel, -90, 90);
    this.pitch = clamp(this.dragStart.pitch - dy * SIM.touchDegPerPixel, -90, 90);
  }
  /** Two-finger horizontal drag: incremental yaw (px since last move). */
  dragYaw(dxDelta: number): void {
    this.yaw = wrapDeg(this.yaw + dxDelta * SIM.yawDegPerPixel);
  }
  endDrag(): void { this.dragging = false; }

  setButton(b: number, down: boolean): void {
    if (b < 0 || b > 3 || this.buttons[b] === down) return;
    this.buttons[b] = down;
    this.emitNow();
  }
  isDown(b: number): boolean { return this.buttons[b] ?? false; }

  private tick = () => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTick) / 1000);
    this.lastTick = now;
    if (SIM.springBack && !this.dragging) {
      const s = SIM.springRateDegPerSec * dt;
      this.roll = Math.abs(this.roll) <= s ? 0 : this.roll - Math.sign(this.roll) * s;
      this.pitch = Math.abs(this.pitch) <= s ? 0 : this.pitch - Math.sign(this.pitch) * s;
    }
    this.emitNow(now);
  };

  /** Send a sample right away (button edges should not wait for the next tick). */
  private emitNow(now = performance.now()): void {
    this.sampleCb?.({
      roll: this.roll, pitch: this.pitch, yaw: this.yaw,
      buttons: [...this.buttons] as [boolean, boolean, boolean, boolean],
      timestamp: now,
    });
  }
}
