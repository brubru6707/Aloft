/**
 * App settings by voice or text: "use a cylinder", "switch to build", "center me",
 * "sensitivity 2", "move on y", "rotate absolute", "size large". Used by the X2D agent's
 * set_control tool and by typed requests (handled instantly, no Gemini call).
 * Pure parsing only; each app applies the command with its own setters.
 */
import { profileFromText } from '../input/buttonMap';

export type ControlSetting = 'mode' | 'shape' | 'size' | 'sensitivity' | 'fly_state' | 'rotate_style' | 'reset_view' | 'controls';
export interface ControlCommand { setting: ControlSetting; value: string }

export const CONTROL_SETTINGS: ControlSetting[] = ['mode', 'shape', 'size', 'sensitivity', 'fly_state', 'rotate_style', 'reset_view', 'controls'];

/** Glove button layout named in loose words ("backup v2", "default version one"). */
function layoutOf(t: string, loose: boolean): string | null {
  const named = /\bback ?up\b/.test(t) || /\bv ?[12]\b|\bversion (1|2|one|two)\b/.test(t) || /\b(layout|controls?|buttons?|glove|setup)\b/.test(t);
  return loose || named ? profileFromText(t) : null;
}

const has = (t: string, re: RegExp) => re.test(t);

function modeOf(t: string): string | null {
  if (has(t, /\bfly(ing)?\b|\bnavigat/)) return 'FLY';
  if (has(t, /\bbuild(ing)?\b|\bplac(e|ing)\b/)) return 'BUILD';
  if (has(t, /\berase\b|\berasing\b|\bdelet/)) return 'ERASE';
  return null;
}
function shapeOf(t: string): string | null {
  // Kit devices first: they are more specific ("servo motor", "arduino uno", "esp32 board", "photo resistor").
  if (has(t, /\b(raspberry( ?pi)?|rasberry( ?pi)?|rpi|pi ?4|pi)\b/)) return 'rpi';
  if (has(t, /\b(esp ?32|esp|e s p 32|esp32 dev ?kit|dev ?kit)\b/)) return 'esp32';
  if (has(t, /\b(uno|arduino uno)\b/)) return 'uno';
  if (has(t, /\b(servos?|servo motor|sg ?90|micro servo)\b/)) return 'servo';
  if (has(t, /\b(bread ?boards?|proto ?board|solderless)\b/)) return 'breadboard';
  if (has(t, /\b(ultrasonic|ultra sonic|hc ?-?sr ?0?4|sonar|distance sensor|range sensor|range finder)\b/)) return 'ultrasonic';
  if (has(t, /\b(lcd|l c d|lcd screen|lcd display|character display|16 ?x ?2|display|screen)\b/)) return 'lcd';
  if (has(t, /\b(photo ?resistors?|photo ?cell|ldr|l d r|light sensor|light dependent resistor)\b/)) return 'ldr';
  if (has(t, /\b(potentiometers?|pot|pots|knob|dial|trimmer|variable resistor)\b/)) return 'pot';
  if (has(t, /\b(resistors?)\b/)) return 'resistor';
  if (has(t, /\b(buzzers?|piezo|beeper|speaker)\b/)) return 'buzzer';
  if (has(t, /\b(batter(y|ies)|9 ?v|nine volt)\b/)) return 'battery';
  if (has(t, /\b(jumpers?|jumper wires?|wires?|cables?|dupont)\b/)) return 'jumper';
  if (has(t, /\b(motors?|dc motor|gear ?motor)\b/)) return 'motor';
  if (has(t, /\b(cube|cubes|cue|queue|box|square|block|brick)s?\b/)) return 'cube';
  if (has(t, /\b(sphere|spheres|ball|orb|round)\b/)) return 'sphere';
  if (has(t, /\b(cylinder|cylinders|sylinder|cilinder|cyllinder|tube|pipe|rod|column)\b/)) return 'cylinder';
  if (has(t, /\b(arduino|nano|nanos|micro ?controller|microcontroller|board)\b/)) return 'nano';
  if (has(t, /\b(led|leds|l e d|light emitting diode|diode|light bulb|bulb)\b/)) return 'led';
  if (has(t, /\b(push ?button|buttons?|tactile|tact switch|push switch)\b/)) return 'button';
  return null;
}
function sizeOf(t: string): string | null {
  if (has(t, /\b(small|smaller|tiny|little|s)\b/)) return 'small';
  if (has(t, /\b(medium|normal|regular|default|m)\b/)) return 'medium';
  if (has(t, /\b(large|larger|big|bigger|huge|l)\b/)) return 'large';
  return null;
}
const NUMBER_WORDS: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
  twenty: '20', forty: '40', sixty: '60', eighty: '80', hundred: '100', 'a hundred': '100', 'one hundred': '100',
};
/** Spoken numbers to digits: "zero point six" -> "0.6", "point four" -> "0.4", "forty percent" -> "40 percent". */
function digits(t: string): string {
  return t.replace(/\b(a hundred|one hundred|zero|one|two|three|four|five|six|seven|eight|nine|ten|twenty|forty|sixty|eighty|hundred)\b/g, (w) => NUMBER_WORDS[w])
    .replace(/\b(\d+) point (\d+)\b/g, '$1.$2').replace(/(^|[^\d.])\s*\bpoint (\d+)\b/g, '$1 0.$2');
}
/** Sensitivity: a level (0 to 1 in steps of 0.2) or 'up' / 'down'. */
function sensOf(raw: string): string | null {
  const t = digits(raw);
  const pct = t.match(/(\d+(?:\.\d+)?)\s*(%|percent)/);
  if (pct) return String(Number(pct[1]) / 100);
  const n = t.match(/(\d*\.?\d+)/);
  if (n) return String(Number(n[1]));
  if (has(t, /\bhalf\b/)) return '0.5';
  if (has(t, /\bmax(imum)?\b|\bfull\b/)) return '1';
  if (has(t, /\bmin(imum)?\b|\boff\b|\bzero\b/)) return '0';
  if (has(t, /\bnormal\b|\bdefault\b|\breset\b/)) return '1';
  if (has(t, /\b(up|higher|more|faster|increase|raise)\b/)) return 'up';  // "more sensitive" too
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
  // A glove layout ("backup v2") wins whatever setting the agent filed it under.
  const layout = layoutOf(`${String(settingRaw ?? '').toLowerCase()} ${v}`, false);
  if (layout && setting !== 'size' && setting !== 'sensitivity') return { setting: 'controls', value: layout };
  switch (setting) {
    case 'mode': { const m = modeOf(v); return m ? { setting, value: m } : { error: `unknown mode "${v}" (FLY, BUILD or ERASE)` }; }
    case 'shape': { const s = shapeOf(v); return s ? { setting, value: s } : { error: `unknown shape "${v}" (cube, sphere, cylinder, nano (Arduino Nano), led, button, or a kit device: raspberry pi, esp32, uno, servo, breadboard, potentiometer, buzzer, ultrasonic, battery, resistor, jumper wire, motor, photoresistor, lcd)` }; }
    case 'size': { const s = sizeOf(v); return s ? { setting, value: s } : { error: `unknown size "${v}" (small, medium or large)` }; }
    case 'sensitivity': { const s = sensOf(v); return s ? { setting, value: s } : { error: `unknown sensitivity "${v}" (0, 0.2, 0.4, 0.6, 0.8, 1, up or down)` }; }
    case 'fly_state': { const s = flyStateOf(v); return s ? { setting, value: s } : { error: `unknown FLY state "${v}" (rotate, X, Y or Z)` }; }
    case 'rotate_style': { const s = rotateStyleOf(v); return s ? { setting, value: s } : { error: `unknown rotate style "${v}" (rate or absolute)` }; }
    case 'reset_view': return { setting, value: '' };
    case 'controls': { const l = layoutOf(v, true); return l ? { setting, value: l } : { error: `unknown layout "${v}" (default v1, default v2 or backup v2)` }; }
    default: return { error: `unknown setting "${settingRaw}" (${CONTROL_SETTINGS.join(', ')})` };
  }
}

/**
 * Recognise a short settings command in free text. Only clear commands match, so
 * "make me a sphere" (a build request) is NOT read as "set shape to sphere".
 */
export function parseControl(text: string): ControlCommand | null {
  const t = text.toLowerCase().replace(/(?<!\d)[.,!?]|[.,!?](?!\d)/g, ' ').replace(/%/g, ' percent ')
    // Spoken filler around the command: "um, can you please give me a servo, thanks".
    .replace(/\b(please|pls|thanks|thank you|um+|uh+|erm|hmm+|okay|ok|alright|hey|just|x ?2 ?d|x two d|ex two d|can you|could you|would you|will you|you know)\b/g, ' ')
    .replace(/\s+/g, ' ').trim().replace(/^(so|and|now) /, '');
  if (!t) return null;
  // About MY shape ("change my shape to …", "replace my cube with …", "switch the shape I'm on to …"):
  // set the shape to whatever is named after the last to / into / with / as. "Turn the cube into …"
  // (no "my" / "shape") still means changing built pieces and goes to Gemini.
  if (has(t, /\b(shape|my (cube|cue|sphere|cylinder|ball|block|piece|part|current one)|currently (on|using|placing|building|holding)|i('m| am) (on|using|placing|building with))\b/)) {
    const target = t.split(/\b(?:to|into|with|as|be)\b/).pop() ?? '';
    const s = shapeOf(target);
    if (s) return { setting: 'shape', value: s };
  }
  if (t.split(' ').length > 9) return null;
  if (has(t, /^(center|centre|recenter|recentre|reset)( me| the view| view| camera| everything| it)?$/) || has(t, /\b(center|centre) me\b|\bback to (the )?start\b|\breset (the )?(view|camera)\b/)) return { setting: 'reset_view', value: '' };
  { const l = layoutOf(t, false); if (l && has(t, /\b(default|back ?up)\b/)) return { setting: 'controls', value: l }; }
  if (has(t, /\bsensitiv(ity|e)\b|\bsens\b/)) { const s = sensOf(t); if (s) return { setting: 'sensitivity', value: s }; }
  if (has(t, /\b(rotate|rotation) (style|mode)?\s*(to )?(absolute|rate)\b|^(absolute|rate) (rotate|rotation)$/)) { const s = rotateStyleOf(t); if (s) return { setting: 'rotate_style', value: s }; }
  if (has(t, /\b(move|moving) (on |along |in )?(the )?[xyz]( axis)?\b|\b[xyz] axis\b|^(rotate|move [xyz])$/)) { const s = flyStateOf(t); if (s) return { setting: 'fly_state', value: s }; }
  const sel = /\b(use|select|pick|choose|switch( it)? to|change( it)? to|set( it)? to|set|go to|swap to|shape|make it a|i want (a|an))\b/;
  // Describes something to build ("make it a big robot", "a robot made of servos"): Gemini, not a setting.
  const describes = /\b(into|turn|replace|convert|transform|build (a|an|me)|on|onto|next to|beside|above|below|under|behind|in front|left of|right of|top of|around|between|(?<!build )with|stack|row|tower|house|robot|circuit|of|made|out)\b/;
  const sizeAlone = /\b(small|smaller|tiny|little|medium|normal|regular|large|larger|big|bigger|huge)( (pieces?|ones?|shapes?|parts?|blocks?|size))?$/;
  // "size large", "make the pieces bigger", "smaller pieces": the piece size, not a build.
  if (has(t, /\bsize\b|\bpieces?\b/) || (has(t, sel) && has(t, sizeAlone) && !shapeOf(t) && !modeOf(t))) { const s = sizeOf(t); if (s) return { setting: 'size', value: s }; }
  if (shapeOf(t) && ((has(t, sel) && !has(t, describes)) || t.split(' ').length <= 2)) return { setting: 'shape', value: shapeOf(t)! };
  // "give me / place / add / let me place / can I have an Arduino Nano": pick it as the BUILD shape
  // (you place it with the glove) instead of asking Gemini to redesign the scene. Requests that
  // change existing pieces or describe an arrangement still go to Gemini.
  const pick = /\b(give( me)?|place|put|add|get|grab|need|spawn|bring|hand me|drop|can i (have|get|use)|i'?d like|i would like|let me (have|place|use|put|build with))\b/;
  const scene = /\b(into|turn|replace|convert|transform|make (it|them|this|that|me)|change|build (a|an|me)|on|onto|next to|beside|above|below|under|behind|in front|left of|right of|top of|around|between|(?<!build )with|stack|row|tower|house|robot|circuit|of)\b/;
  if (shapeOf(t) && has(t, pick) && !has(t, scene)) return { setting: 'shape', value: shapeOf(t)! };
  const short = t.split(' ').length <= 2 && !has(t, /\b(everything|all|it|this|that|them|scene|last)\b/);
  const wantMode = /^(let me|i (want|need) to|i wanna|time to|start|go) (fly|flying|build|building|erase|erasing)( mode)?$/;
  if (modeOf(t) && (has(t, sel) || has(t, /\bmode\b/) || short || has(t, wantMode))) return { setting: 'mode', value: modeOf(t)! };
  return null;
}
