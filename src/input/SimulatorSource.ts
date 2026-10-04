import { SIM } from '../config';
import { clamp, wrapDeg } from './filter';
import type { GloveSource, RawSample, SourceStatus } from './types';

/**
 * Keyboard/mouse glove simulator.
 *  - Arrow keys: ←/→ roll, ↑/↓ pitch (spring back to level on release)
 *  - Q / E: yaw left / right (does not spring back)
 *  - Mouse drag on the canvas: roll (x) / pitch (y)
 *  - Keys 1-6: jobs MODE, ACTION, SENS, RESET, UNDO, PREV (hold = held)
 */
export class SimulatorSource implements GloveSource {
  readonly kind = 'sim' as const;
  readonly name = 'Simulator';

  private roll = 0;
  private pitch = 0;
  private yaw = 0;
  private buttons: boolean[] = [false, false, false, false, false, false];
  private keys = new Set<string>();
  private dragging = false;
  private dragStart = { x: 0, y: 0, roll: 0, pitch: 0 };
  private timer: number | null = null;
  private lastTick = 0;
  private sampleCb: ((s: RawSample) => void) | null = null;
  private statusCb: ((s: SourceStatus, d?: string) => void) | null = null;

  constructor(private dragTarget: HTMLElement) {}

  onSample(cb: (s: RawSample) => void): void { this.sampleCb = cb; }
  onStatus(cb: (s: SourceStatus, d?: string) => void): void { this.statusCb = cb; }

  async connect(): Promise<void> {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    this.dragTarget.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    this.lastTick = performance.now();
    this.timer = window.setInterval(this.tick, 1000 / SIM.hz);
    this.statusCb?.('connected', 'keyboard / mouse');
  }

  disconnect(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.dragTarget.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.keys.clear();
    this.buttons = [false, false, false, false, false, false];
    this.statusCb?.('disconnected');
  }

  private buttonIndex(key: string): number {
    const i = ['1', '2', '3', '4', '5', '6'].indexOf(key);
    return i;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    const b = this.buttonIndex(e.key);
    if (b >= 0) {
      e.preventDefault();
      if (!this.buttons[b]) { this.buttons[b] = true; this.emitNow(); }
      return;
    }
    const k = e.key.toLowerCase();
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'q', 'e'].includes(k)) {
      this.keys.add(k);
      e.preventDefault();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const b = this.buttonIndex(e.key);
    if (b >= 0) {
      if (this.buttons[b]) { this.buttons[b] = false; this.emitNow(); }
      return;
    }
    this.keys.delete(e.key.toLowerCase());
  };

  private onBlur = () => {
    this.keys.clear();
    this.buttons = [false, false, false, false, false, false];
    this.dragging = false;
  };

  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    this.dragging = true;
    this.dragStart = { x: e.clientX, y: e.clientY, roll: this.roll, pitch: this.pitch };
  };
  private onPointerMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    const dx = e.clientX - this.dragStart.x;
    const dy = e.clientY - this.dragStart.y;
    this.roll = clamp(this.dragStart.roll + dx * SIM.mouseDegPerPixel, -90, 90);
    this.pitch = clamp(this.dragStart.pitch - dy * SIM.mouseDegPerPixel, -90, 90);
  };
  private onPointerUp = () => { this.dragging = false; };

  private tick = () => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTick) / 1000);
    this.lastTick = now;
    const rate = SIM.keyRateDegPerSec * dt;

    let rollInput = 0, pitchInput = 0, yawInput = 0;
    if (this.keys.has('arrowleft')) rollInput -= 1;
    if (this.keys.has('arrowright')) rollInput += 1;
    if (this.keys.has('arrowup')) pitchInput += 1;
    if (this.keys.has('arrowdown')) pitchInput -= 1;
    if (this.keys.has('q')) yawInput -= 1;
    if (this.keys.has('e')) yawInput += 1;

    if (rollInput) this.roll = clamp(this.roll + rollInput * rate, -90, 90);
    if (pitchInput) this.pitch = clamp(this.pitch + pitchInput * rate, -90, 90);
    if (yawInput) this.yaw = wrapDeg(this.yaw + yawInput * rate);

    if (SIM.springBack && !this.dragging) {
      const s = SIM.springRateDegPerSec * dt;
      if (!rollInput) this.roll = Math.abs(this.roll) <= s ? 0 : this.roll - Math.sign(this.roll) * s;
      if (!pitchInput) this.pitch = Math.abs(this.pitch) <= s ? 0 : this.pitch - Math.sign(this.pitch) * s;
    }

    this.emitNow(now);
  };

  /** Send a sample right away (button edges should not wait for the next tick). */
  private emitNow(now = performance.now()): void {
    this.sampleCb?.({
      roll: this.roll, pitch: this.pitch, yaw: this.yaw,
      buttons: [...this.buttons],
      timestamp: now,
    });
  }
}
