/**
 * Aloft configuration. Edit button mappings and tuning here.
 * Button indices are 0..3 and match the firmware bitmask (bit n = button n).
 */

export type Gesture = 'tap' | 'hold' | 'press';   // press = act the instant the button goes down

export interface ButtonAction {
  button: number;
  gesture: Gesture;
}

/** Global actions that work in every mode. */
export const GLOBAL_ACTIONS = {
  // B0 advances the mode the instant it is pressed. Measured presses on this glove last ~1 s,
  // so a tap/hold split on the same button made every long press go backwards instead.
  modeNext: { button: 0, gesture: 'press' } as ButtonAction,
  // Previous mode is not on the glove any more: click a mode chip in the panel, or Shift+Tab.
  modePrev: null as ButtonAction | null,
  undo:     { button: 2, gesture: 'press' } as ButtonAction,   // B2 = GPIO 27
};

/** Per-mode button roles. "primary" is the main action button. */
export const MODE_BUTTONS = {
  primary: 1,   // FLY: pinky MOVE/ROTATE cycle.  GRAB: hold = move.  BUILD/ERASE: place/delete.  GRAB/SCALE: select
};

/**
 * Sensitivity: one multiplier on every hand-driven rate (turn, look, move, grab, scale).
 * B3 (GPIO 26) cycles through the levels in every mode except BUILD, where B3 cycles the piece
 * size instead; the toolbar button always cycles sensitivity.
 */
export const SENSITIVITY = {
  button: 3,
  levels: [0.5, 1, 1.5, 2],
  startIndex: 1,
};
/** Mutable runtime state (changed live by buttons / UI, not a tuning constant). */
export const RUNTIME = { sensitivity: SENSITIVITY.levels[SENSITIVITY.startIndex] };

export const MODE_ORDER = ['FLY', 'GRAB', 'SCALE', 'BUILD', 'ERASE'] as const;
export type ModeName = (typeof MODE_ORDER)[number];

export const MODE_COLORS: Record<ModeName, string> = {
  FLY:   '#e87d0d',  // Blender orange
  GRAB:  '#ff9f3c',
  SCALE: '#8bdc00',  // Blender Y-axis green
  BUILD: '#ffd43b',
  ERASE: '#ff3352',  // Blender X-axis red
};

export const MODE_HINTS: Record<ModeName, string> = {
  FLY:   'B1 (pinky): MOVE X → ROTATE → MOVE Y → ROTATE → MOVE Z … · roll to turn, pitch to look · B3 sensitivity',
  GRAB:  'Hold B1 + move hand to drag · tilt to rotate · tap B1 to select',
  SCALE: 'Pitch up/down to scale · tap B1 to select',
  BUILD: 'Turn hand to aim · press B1 to place · B3 cycles size · shape in the panel',
  ERASE: 'Turn hand to aim · tap B1 to delete the object under the cursor',
};

/** World units: 1 three.js unit = 1 cm. The floor grid, readouts and STL export use this. */
export const UNITS = { name: 'cm', gridMinorCm: 1, gridMajorCm: 10, gridExtentCm: 600, labelEveryCm: 10, labelRangeCm: 100, stlScale: 10 /* cm -> mm for slicers */ };

/** Glove identity. Up to two gloves. */
export const GLOVE_COLORS = ['#e87d0d', '#5680c2']; // Blender orange, Blender selection blue
export const GLOVE_DEFAULT_MODE: ModeName[] = ['FLY', 'BUILD'];
export const MAX_GLOVES = 2;

/** Input processing. */
export const INPUT = {
  tapMaxMs: 500,          // press shorter than this = tap, longer = hold (B0 prev-mode, GRAB move)
  smoothing: 0.35,        // exponential filter alpha (0..1, higher = less smoothing)
  deadzoneDeg: 4,         // orientation below this magnitude is treated as zero
  maxTiltDeg: 60,         // clamp for roll/pitch after recentering
  invertPitch: false,     // flip if "hand up" moves the camera down on your glove
  invertRoll: false,      // flip if rolling right reads negative on the panel
};

/** X2D voice assistant (ElevenLabs Agents). The agent is public, so only its id is needed. */
export const VOICE = {
  agentId: 'agent_8201m413w8nyf63thnzzcrexwx1t',   // "Aloft X2D" in the ElevenLabs dashboard
  wakeWords: ['x2d', 'x 2 d', 'x two d', 'x to d', 'x too d', 'ex 2 d', 'ex two d', 'extudy'],
  lang: 'en-US',
  autoListen: true,       // start watching for the wake word as soon as the page loads (asks for the mic once)
};

/** Gemini (Google AI Studio). Key lives in .env.local as VITE_GEMINI_API_KEY. */
export const GEMINI = {
  model: 'gemini-3.8-flash',   // the API retired gemini-2.5-flash for new keys
  maxOutputTokens: 200,
  retries: 2,              // extra attempts on 503 (overloaded) / 429 (rate limited), with backoff
  systemPrompt: 'You are the assistant inside Aloft, a hand-controlled 3D building app where the world is in centimetres. Answer in one or two short sentences, plain text, no markdown.',
};

/** Web Bluetooth (Nordic UART Service). */
export const BLE = {
  namePrefix: 'Aloft',
  service: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
  rxCharacteristic: '6e400002-b5a3-f393-e0a9-e50e24dcca9e', // write (phone -> glove), unused for now
  txCharacteristic: '6e400003-b5a3-f393-e0a9-e50e24dcca9e', // notify (glove -> phone)
  reconnectAttempts: 3,   // silent reconnects after an unexpected drop
  reconnectDelayMs: 1000,
};

/** Simulator tuning. */
export const SIM = {
  keyRateDegPerSec: 120,  // arrow key tilt speed
  mouseDegPerPixel: 0.35,
  springBack: true,       // return to level when no key/mouse input (like relaxing your hand)
  springRateDegPerSec: 240,
  hz: 50,
};

/** Mode tuning. */
/**
 * FLY: the "pinky" button alternates between a MOVE axis and ROTATE.
 *   tap -> MOVE: X, tap -> ROTATE, tap -> MOVE: Y, tap -> ROTATE, tap -> MOVE: Z, tap -> ROTATE, tap -> MOVE: X ...
 * MOVE: only the active world axis translates, driven by one hand tilt.
 * ROTATE: the hand turns the camera (turnAxis) and looks up/down (lookAxis).
 * Direction flips: axisSign / invertTurn / invertLook below, or INPUT.invertRoll / INPUT.invertPitch.
 */
export type FlyAxis = 'X' | 'Y' | 'Z';
export type TiltInput = 'roll' | 'pitch';
export type TiltAxis = TiltInput | 'yaw';
export const FLY = {
  axisCycleButton: 1,                       // B1 = pinky button (GPIO 25 on the glove). Acts on the press edge.
  cycleCooldownMs: 200,                     // ignore a second press within this (contact bounce / double report)
  axisOrder: ['X', 'Y', 'Z'] as FlyAxis[],  // MOVE cycle order; ROTATE sits between each
  // Sideways from sideways tilt, forward/up from forward/up tilt:
  //   X (left/right)   <- roll:  roll right  = +X (right)
  //   Y (up/down)      <- pitch: hand up     = +Y (up)
  //   Z (forward/back) <- pitch: tilt forward (nose down, negative pitch) = forward (-Z)
  axisControl: { X: 'roll', Y: 'pitch', Z: 'pitch' } as Record<FlyAxis, TiltInput>,
  axisSign: { X: 1, Y: 1, Z: 1 } as Record<FlyAxis, 1 | -1>,
  deadzoneDeg: 2,          // tilt below this does nothing; speed ramps smoothly from 0 past it
  fullTiltDeg: 25,         // tilt at which the camera moves (or turns) at full speed; a relaxed 10-15° already moves briskly
  speed: 20,               // cm / s at full tilt (times the sensitivity multiplier)
  minHeight: 0.6,
  rotate: {
    // 'rate': tilt sets a turn speed, the camera keeps turning while the hand is deflected.
    // 'absolute': the camera angle follows the hand angle 1:1 (times gain); turn 180°, it stays there.
    // Toggled live by the "Rotate" toolbar button; this is just the start-up default.
    style: 'rate' as RotateStyle,
    // With the board mounted on the back of the hand, turning the hand left/right shows up as
    // ROLL (accelerometer-stabilised, no drift), so that is the turn axis. Roll right = turn right.
    turnAxis: 'roll' as TiltAxis,  // hand axis that turns the camera left/right
    lookAxis: 'pitch' as TiltAxis, // hand axis that looks up/down (hand up = look up)
    invertTurn: false,
    invertLook: false,
    yawRateDegPerSec: 90,          // rate style: at full turn-axis deflection
    pitchRateDegPerSec: 60,        // rate style: at full look-axis deflection
    absoluteGain: 1.0,             // absolute style: camera degrees per hand degree
  },
};
export type RotateStyle = 'rate' | 'absolute';

/**
 * Modes (besides FLY's ROTATE state) where glove 1's hand also turns the camera.
 * Only modes that do not already use tilt for something else belong here:
 * GRAB/SCALE use tilt to move or scale, so they are left out.
 */
export const ROTATE_IN_MODES: ModeName[] = ['BUILD', 'ERASE'];
export const GRAB = { moveUnitsPerDeg: 0.08, rotateRadPerSecAtFull: 1.6 };
export const SCALE = { ratePerSec: 1.2, min: 0.1, max: 30 };
export const BUILD = {
  maxAimDistance: 400,    // the crosshair ray places the piece on whatever it hits within this range (cm)
  distance: 6,            // fallback float distance (cm) when the crosshair points at nothing
  maxDropDistance: 60,    // fallback: new objects fall onto the first surface this far below the point
  primitives: ['cube', 'sphere', 'cylinder'] as const,
  // Piece size. In BUILD, B3 cycles small -> medium -> large (elsewhere B3 is sensitivity).
  sizes: ['small', 'medium', 'large'] as const,
  sizeScale: { small: 0.5, medium: 1, large: 2 } as Record<'small' | 'medium' | 'large', number>,
  defaultSize: 'medium' as 'small' | 'medium' | 'large',
};
export type PrimitiveName = (typeof BUILD.primitives)[number];
export type SizeName = (typeof BUILD.sizes)[number];
