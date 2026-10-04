/**
 * Glove buttons: pinouts, jobs and named layouts.
 *
 * Each glove's firmware sends "roll,pitch,yaw,mask,version"; bit i of the mask is pin
 * GLOVE_PINOUTS[version][i]. Firmware without the version field is the original V1 glove.
 * Every pin is given a job (a ROLE). The rest of the app only sees jobs: logical button
 * BTN.MODE = next mode, BTN.ACTION = place / erase / FLY state, and so on.
 *
 * Named layouts (PROFILES) set every pin of one glove at once. They are switched by voice
 * ("X2D, backup V2"), by typing, or from the glove panel; any pin can also be changed by hand.
 */

export type GloveVersion = 1 | 2;
export const GLOVE_VERSIONS: GloveVersion[] = [1, 2];

/** Pin behind each firmware bit, per glove (must match BUTTON_PINS in the firmware). */
export const GLOVE_PINOUTS: Record<GloveVersion, number[]> = {
  1: [13, 25, 27, 26],
  2: [13, 14, 27, 26, 25, 32, 33],
};
/** Where each pin sits on the (right-hand) glove, for the panel tooltips. */
export const PIN_PLACES: Record<GloveVersion, Record<number, string>> = {
  1: { 13: 'index finger', 25: 'middle finger', 26: 'ring finger', 27: 'pinky' },
  2: {
    14: 'index finger, side, bottom', 32: 'index finger, side, middle', 13: 'index finger, side, near the tip',
    25: 'index fingertip', 33: 'middle fingertip', 27: 'middle finger, thumb side', 26: 'ring fingertip',
  },
};

export interface ButtonRole { id: string; short: string; label: string }
/** Index = logical button the app listens to. */
export const ROLES: ButtonRole[] = [
  { id: 'mode', short: 'MODE', label: 'Next mode (FLY → BUILD → ERASE)' },
  { id: 'action', short: 'ACTION', label: 'Action: FLY rotate/move, place, erase' },
  { id: 'sens', short: 'SENS', label: 'Tap: speed (FLY) / size (BUILD, ERASE). Hold: reset everything' },
  { id: 'reset', short: 'RESET', label: 'Reset view and zero the glove' },
  { id: 'undo', short: 'UNDO', label: 'Undo' },
  { id: 'prev', short: 'PREV', label: 'Previous mode' },
  { id: 'option', short: 'OPTION', label: 'Option: shape (BUILD, ERASE) / direction X, Y, Z (FLY)' },
  { id: 'fly', short: 'FLY', label: 'FLY: switch to FLY; in FLY, toggle rotate / move' },
  { id: 'build', short: 'BUILD', label: 'BUILD: switch to BUILD; in BUILD, place a piece' },
  { id: 'erase', short: 'ERASE', label: 'ERASE: switch to ERASE; in ERASE, erase' },
];
export const BTN = { MODE: 0, ACTION: 1, SENS: 2, RESET: 3, UNDO: 4, PREV: 5, OPTION: 6, FLY: 7, BUILD: 8, ERASE: 9 } as const;
export const NUM_LOGICAL = ROLES.length;
export const OFF = -1;

export interface Profile { id: string; name: string; version: GloveVersion; roles: Record<number, number> }
export const PROFILES: Profile[] = [
  {
    id: 'default-v1', name: 'Default V1', version: 1,
    roles: { 13: BTN.MODE, 25: BTN.ACTION, 26: BTN.SENS, 27: BTN.RESET },
  },
  {
    // Whole side of the index finger (14, 32, 13) = option; fingertips pick the mode (press again
    // to act); 27 (middle of the middle finger, thumb side) = sensitivity.
    id: 'default-v2', name: 'Default V2', version: 2,
    roles: { 14: BTN.OPTION, 32: BTN.OPTION, 13: BTN.OPTION, 25: BTN.BUILD, 33: BTN.ERASE, 26: BTN.FLY, 27: BTN.SENS },
  },
  {
    // Mode / option / sensitivity on the side of the index finger AND on the fingertips, so
    // either row alone still drives everything; 14 (bottom of the index side) places / erases /
    // toggles FLY; 27 (middle of the middle finger) is sensitivity.
    id: 'backup-v2', name: 'Backup V2', version: 2,
    roles: { 13: BTN.MODE, 32: BTN.OPTION, 14: BTN.ACTION, 25: BTN.MODE, 33: BTN.OPTION, 26: BTN.SENS, 27: BTN.SENS },
  },
];
const DEFAULT_PROFILE: Record<GloveVersion, string> = { 1: 'default-v1', 2: 'default-v2' };
export const profilesFor = (v: GloveVersion) => PROFILES.filter((p) => p.version === v);

// ---------- state (per glove version, remembered on this device when storage exists) ----------
const STORE_KEY = 'aloft.buttonLayouts.v4';   // v4: 14 = index side bottom, 27 = middle finger side
interface Stored { roles: Record<GloveVersion, Record<number, number>>; profile: Record<GloveVersion, string> }
let state: Stored = load();
let lastVersion: GloveVersion = 2;
const listeners = new Set<() => void>();

function defaults(): Stored {
  const p = (v: GloveVersion) => PROFILES.find((x) => x.id === DEFAULT_PROFILE[v])!;
  return { roles: { 1: { ...p(1).roles }, 2: { ...p(2).roles } }, profile: { 1: DEFAULT_PROFILE[1], 2: DEFAULT_PROFILE[2] } };
}
function load(): Stored {
  const d = defaults();
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(STORE_KEY) ?? 'null') as Stored | null;
    if (saved?.roles && saved.profile) {
      for (const v of GLOVE_VERSIONS) {
        for (const pin of GLOVE_PINOUTS[v]) {
          const r = saved.roles[v]?.[pin];
          if (Number.isInteger(r) && r >= OFF && r < NUM_LOGICAL) d.roles[v][pin] = r;
        }
        if (typeof saved.profile[v] === 'string') d.profile[v] = saved.profile[v];
      }
    }
  } catch { /* no storage (phone) or bad data: defaults */ }
  return d;
}
function save(): void {
  try { globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* best effort */ }
  listeners.forEach((cb) => cb());
}
export function onRolesChange(cb: () => void): () => void { listeners.add(cb); return () => { listeners.delete(cb); }; }

export const pinsOf = (v: GloveVersion) => GLOVE_PINOUTS[v];
/** Job of a pin on a glove (OFF if unassigned). */
export function roleOf(v: GloveVersion, pin: number): number { return state.roles[v][pin] ?? OFF; }
/** Active layout id for a glove, or 'custom' after a pin was changed by hand. */
export function profileOf(v: GloveVersion): string { return state.profile[v]; }
export function profileName(id: string): string { return PROFILES.find((p) => p.id === id)?.name ?? 'Custom'; }

export function setRole(v: GloveVersion, pin: number, role: number): void {
  state = { ...state, roles: { ...state.roles, [v]: { ...state.roles[v], [pin]: role } }, profile: { ...state.profile, [v]: 'custom' } };
  save();
}
/** Next job for a pin: MODE → ACTION → … → ERASE → OFF → MODE … */
export function cycleRole(v: GloveVersion, pin: number, step = 1): void {
  const n = NUM_LOGICAL + 1;   // + OFF
  const r = roleOf(v, pin);
  const cur = r === OFF ? NUM_LOGICAL : r;
  const next = (((cur + step) % n) + n) % n;
  setRole(v, pin, next === NUM_LOGICAL ? OFF : next);
}
/** Switch one glove to a named layout. Returns it, or null for an unknown id. */
export function applyProfile(id: string): Profile | null {
  const p = PROFILES.find((x) => x.id === id);
  if (!p) return null;
  state = { roles: { ...state.roles, [p.version]: { ...p.roles } }, profile: { ...state.profile, [p.version]: p.id } };
  save();
  return p;
}
export function resetRoles(v: GloveVersion): void { applyProfile(DEFAULT_PROFILE[v]); }
export function roleShort(role: number): string { return role === OFF ? 'OFF' : ROLES[role].short; }

/**
 * Layout id from loose words: "default v2", "backup version two", "default" (uses the
 * glove that is connected now). Null if the text names no layout.
 */
export function profileFromText(text: string, current: GloveVersion = lastVersion): string | null {
  const t = text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
  const kind = /\bback ?up\b/.test(t) ? 'backup' : /\bdefault\b/.test(t) ? 'default' : null;
  if (!kind) return null;
  const m = t.match(/\bv ?(1|2)\b/) ?? t.match(/\b(?:version|glove)\s*(1|2|one|two)\b/) ?? t.match(/\b(1|2|one|two)\b/);
  const v: GloveVersion = m ? (m[1] === '1' || m[1] === 'one' ? 1 : 2) : current;
  const id = `${kind}-v${v}`;
  return PROFILES.some((p) => p.id === id) ? id : null;
}

/** The glove version seen most recently (what "default" means without a version). */
export function currentVersion(): GloveVersion { return lastVersion; }

/** Firmware bitmask -> logical buttons (a job is down while any pin with that job is down). */
export function decodeMask(mask: number, version: GloveVersion): boolean[] {
  lastVersion = version;
  const out = new Array<boolean>(NUM_LOGICAL).fill(false);
  const pins = GLOVE_PINOUTS[version];
  for (let i = 0; i < pins.length; i++) {
    const r = roleOf(version, pins[i]);
    if (r !== OFF && mask & (1 << i)) out[r] = true;
  }
  return out;
}
/** Is this pin held in a raw firmware mask? */
export function pinDown(mask: number, version: GloveVersion, pin: number): boolean {
  const i = GLOVE_PINOUTS[version].indexOf(pin);
  return i >= 0 && !!(mask & (1 << i));
}
/** Version field of a firmware line (missing = the original V1 glove). */
export function parseVersion(field: string | undefined): GloveVersion { return field?.trim() === '2' ? 2 : 1; }
