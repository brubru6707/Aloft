/**
 * App settings by voice or text: "use a cylinder", "switch to build", "center me",
 * "sensitivity 2", "move on y", "rotate absolute", "size large". Used by the X2D agent's
 * set_control tool and by typed requests (handled instantly, no Gemini call).
 * Pure parsing only; each app applies the command with its own setters.
 */
export type ControlSetting = 'mode' | 'shape' | 'size' | 'sensitivity' | 'fly_state' | 'rotate_style' | 'reset_view';
export interface ControlCommand { setting: ControlSetting; value: string }

export const CONTROL_SETTINGS: ControlSetting[] = ['mode', 'shape', 'size', 'sensitivity', 'fly_state', 'rotate_style', 'reset_view'];

const has = (t: string, re: RegExp) => re.test(t);

function modeOf(t: string): string | null {
  if (has(t, /\bfly(ing)?\b|\bnavigat/)) return 'FLY';
  if (has(t, /\bscal(e|ing)\b|\bresiz/)) return 'SCALE';
  if (has(t, /\bbuild(ing)?\b|\bplac(e|ing)\b/)) return 'BUILD';
  if (has(t, /\berase\b|\berasing\b|\bdelet/)) return 'ERASE';
  return null;
}
function shapeOf(t: string): string | null {
  if (has(t, /\b(cube|cubes|box|square|block|brick)s?\b/)) return 'cube';
  if (has(t, /\b(sphere|spheres|ball|orb|round)\b/)) return 'sphere';
  if (has(t, /\b(cylinder|cylinders|sylinder|cilinder|cyllinder|tube|pipe|rod|can|column)\b/)) return 'cylinder';
  return null;
}
function sizeOf(t: string): string | null {
  if (has(t, /\b(small|tiny|little|s)\b/)) return 'small';
  if (has(t, /\b(medium|normal|regular|default|m)\b/)) return 'medium';
  if (has(t, /\b(large|big|huge|l)\b/)) return 'large';
  return null;
}
/** Sensitivity: a level (0.5 / 1 / 1.5 / 2) or 'up' / 'down'. */
function sensOf(t: string): string | null {
  const n = t.match(/(\d+(?:\.\d+)?)/);
  if (n) return n[1];
  if (has(t, /\bhalf\b/)) return '0.5';
  if (has(t, /\bdouble\b|\bmax(imum)?\b/)) return '2';
  if (has(t, /\bnormal\b|\bdefault\b|\breset\b/)) return '1';
  if (has(t, /\b(up|higher|more|faster|increase|raise)\b/)) return 'up';
  if (has(t, /\b(down|lower|less|slower|decrease|reduce)\b/)) return 'down';
  return null;
}
function flyStateOf(t: string): string | null {
  if (has(t, /\b(rotate|rotation|look|turn)\b/)) return 'rotate';
  if (has(t, /\bx\b|\bsideways\b|\bleft\b|\bright\b/)) return 'X';
  if (has(t, /\by\b|\bup\b|\bdown\b|\bvertical/)) return 'Y';
  if (has(t, /\bz\b|\bforward|\bbackward|\bback\b/)) return 'Z';
  return null;
}
function rotateStyleOf(t: string): string | null {
  if (has(t, /\babsolute\b|\bfollow/)) return 'absolute';
  if (has(t, /\brate\b|\bspeed\b|\bkeep turning/)) return 'rate';
  return null;
}

/** Turn a tool call's (setting, value) into a clean command, tolerating loose wording. */
export function normalizeControl(settingRaw: unknown, valueRaw: unknown): ControlCommand | { error: string } {
  const setting = String(settingRaw ?? '').toLowerCase().trim().replace(/[\s-]+/g, '_') as ControlSetting;
  const v = String(valueRaw ?? '').toLowerCase().trim();
  switch (setting) {
    case 'mode': { const m = modeOf(v); return m ? { setting, value: m } : { error: `unknown mode "${v}" (FLY, SCALE, BUILD or ERASE)` }; }
    case 'shape': { const s = shapeOf(v); return s ? { setting, value: s } : { error: `unknown shape "${v}" (cube, sphere or cylinder)` }; }
    case 'size': { const s = sizeOf(v); return s ? { setting, value: s } : { error: `unknown size "${v}" (small, medium or large)` }; }
    case 'sensitivity': { const s = sensOf(v); return s ? { setting, value: s } : { error: `unknown sensitivity "${v}" (0.5, 1, 1.5, 2, up or down)` }; }
    case 'fly_state': { const s = flyStateOf(v); return s ? { setting, value: s } : { error: `unknown FLY state "${v}" (rotate, X, Y or Z)` }; }
    case 'rotate_style': { const s = rotateStyleOf(v); return s ? { setting, value: s } : { error: `unknown rotate style "${v}" (rate or absolute)` }; }
    case 'reset_view': return { setting, value: '' };
    default: return { error: `unknown setting "${settingRaw}" (${CONTROL_SETTINGS.join(', ')})` };
  }
}

/**
 * Recognise a short settings command in free text. Only clear commands match, so
 * "make me a sphere" (a build request) is NOT read as "set shape to sphere".
 */
export function parseControl(text: string): ControlCommand | null {
  const t = text.toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.split(' ').length > 9) return null;
  if (has(t, /^(center|centre|recenter|recentre|reset)( me| the view| view| camera| everything| it)?$/) || has(t, /\b(center|centre) me\b|\bback to (the )?start\b|\breset (the )?(view|camera)\b/)) return { setting: 'reset_view', value: '' };
  if (has(t, /\bsensitivity\b|\bsens\b/)) { const s = sensOf(t); if (s) return { setting: 'sensitivity', value: s }; }
  if (has(t, /\b(rotate|rotation) (style|mode)?\s*(to )?(absolute|rate)\b|^(absolute|rate) (rotate|rotation)$/)) { const s = rotateStyleOf(t); if (s) return { setting: 'rotate_style', value: s }; }
  if (has(t, /\b(move|moving) (on |along |in )?(the )?[xyz]( axis)?\b|\b[xyz] axis\b|^(rotate|move [xyz])$/)) { const s = flyStateOf(t); if (s) return { setting: 'fly_state', value: s }; }
  const sel = /\b(use|select|pick|choose|switch( it)? to|change( it)? to|set( it)? to|set|go to|swap to|shape|make it a|i want (a|an))\b/;
  if (has(t, /\bsize\b/) || (has(t, sel) && !shapeOf(t) && !modeOf(t))) { const s = sizeOf(t); if (s) return { setting: 'size', value: s }; }
  if (shapeOf(t) && (has(t, sel) || t.split(' ').length <= 2)) return { setting: 'shape', value: shapeOf(t)! };
  if (modeOf(t) && (has(t, sel) || has(t, /\bmode\b/) || t.split(' ').length <= 2)) return { setting: 'mode', value: modeOf(t)! };
  return null;
}
