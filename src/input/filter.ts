/** Wrap an angle in degrees to (-180, 180]. */
export function wrapDeg(a: number): number {
  a = ((a + 180) % 360 + 360) % 360 - 180;
  return a === -180 ? 180 : a;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Exponential smoothing filter that is angle-aware (handles the ±180 wrap). */
export class AngleFilter {
  private value: number | null = null;
  constructor(private alpha: number) {}
  reset(): void { this.value = null; }
  push(x: number): number {
    if (this.value === null) { this.value = x; return x; }
    const diff = wrapDeg(x - this.value);
    this.value = wrapDeg(this.value + this.alpha * diff);
    return this.value;
  }
  get(): number { return this.value ?? 0; }
}

/** Deadzone with rescaling so output is continuous at the deadzone edge. */
export function deadzone(v: number, dz: number, max: number): number {
  const a = Math.abs(v);
  if (a < dz) return 0;
  const scaled = ((a - dz) / (max - dz)) * max;
  return Math.sign(v) * clamp(scaled, 0, max);
}
