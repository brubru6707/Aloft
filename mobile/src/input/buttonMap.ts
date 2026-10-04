/**
 * Mix-and-match glove buttons. The firmware sends one bit per wired pin (bit i = GPIO
 * GLOVE_PINS[i]); each pin is assigned a job (a ROLE). The rest of the app only sees the
 * jobs: logical button 0 = next mode, 1 = action, 2 = sensitivity / size, 3 = reset view,
 * 4 = undo, 5 = previous mode. Several pins may share a job, and a pin can be turned off.
 * Assignments change live from the glove panel and are remembered on this device.
 */

/** Pin behind each firmware bit, in the firmware's BUTTON_PINS order. */
export const GLOVE_PINS = [13, 14, 27, 26, 25, 32, 33];

export interface ButtonRole { id: string; short: string; label: string }
/** Index = logical button the modes and global actions listen to. */
export const ROLES: ButtonRole[] = [
  { id: 'mode', short: 'MODE', label: 'Next mode' },
  { id: 'action', short: 'ACTION', label: 'Action: FLY state / place / erase' },
  { id: 'sens', short: 'SENS', label: 'Sensitivity (FLY) / size (BUILD, ERASE)' },
  { id: 'reset', short: 'RESET', label: 'Reset view and zero the glove' },
  { id: 'undo', short: 'UNDO', label: 'Undo' },
  { id: 'prev', short: 'PREV', label: 'Previous mode' },
];
export const NUM_LOGICAL = ROLES.length;
export const OFF = -1;

/** Default jobs per pin: the original four pins keep their old jobs, 14, 32 and 33 are new
 *  (33 starts OFF until you give it a job in the glove panel). */
export const DEFAULT_ROLES = [0 /* 13 mode */, 4 /* 14 undo */, 3 /* 27 reset */, 2 /* 26 sens */, 1 /* 25 action */, 5 /* 32 prev */, -1 /* 33 off */];

const STORE_KEY = 'aloft.buttonRoles.v1';
let roles: number[] = load();
let lastMask = 0;
const listeners = new Set<() => void>();

function load(): number[] {
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(STORE_KEY) ?? 'null');
    if (Array.isArray(saved) && saved.length <= GLOVE_PINS.length && saved.every((r) => Number.isInteger(r) && r >= OFF && r < NUM_LOGICAL)) {
      return [...saved, ...DEFAULT_ROLES.slice(saved.length)];   // pins added since it was saved start at their default
    }
  } catch { /* no storage (phone) or bad data: defaults */ }
  return [...DEFAULT_ROLES];
}
function save(): void {
  try { globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify(roles)); } catch { /* best effort */ }
  listeners.forEach((cb) => cb());
}

/** Current job per pin (OFF = ignored). */
export function getRoles(): readonly number[] { return roles; }
export function setRole(pinIndex: number, role: number): void { roles = roles.map((r, i) => (i === pinIndex ? role : r)); save(); }
/** Next job for a pin: MODE → ACTION → SENS → RESET → UNDO → PREV → OFF → MODE … */
export function cycleRole(pinIndex: number, step = 1): void {
  const n = NUM_LOGICAL + 1;   // + OFF
  const cur = roles[pinIndex] === OFF ? NUM_LOGICAL : roles[pinIndex];
  const next = (((cur + step) % n) + n) % n;
  setRole(pinIndex, next === NUM_LOGICAL ? OFF : next);
}
export function resetRoles(): void { roles = [...DEFAULT_ROLES]; save(); }
export function onRolesChange(cb: () => void): () => void { listeners.add(cb); return () => { listeners.delete(cb); }; }
export function roleShort(role: number): string { return role === OFF ? 'OFF' : ROLES[role].short; }

/** Firmware bitmask -> logical buttons (a job is down while any pin assigned to it is down). */
export function decodeMask(mask: number): boolean[] {
  lastMask = mask;
  const out = new Array<boolean>(NUM_LOGICAL).fill(false);
  for (let i = 0; i < GLOVE_PINS.length; i++) {
    const r = roles[i];
    if (r !== OFF && mask & (1 << i)) out[r] = true;
  }
  return out;
}
/** Is the pin behind firmware bit i held right now (last glove sample)? */
export function pinDown(pinIndex: number): boolean { return !!(lastMask & (1 << pinIndex)); }
/** Forget the last physical state (on disconnect). */
export function clearMask(): void { lastMask = 0; }
