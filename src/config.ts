/**
 * Aloft mobile configuration. Every tunable lives here.
 * Ported from the web app's src/config.ts; mobile-only sections are marked.
 * Button indices are 0..3 and match the firmware bitmask (bit n = button n).
 */

export type Gesture = 'tap' | 'hold';

export interface ButtonAction {
  button: number;
  gesture: Gesture;
}

/** Global actions that work in every mode. */
export const GLOBAL_ACTIONS = {
  modeNext: { button: 0, gesture: 'tap' } as ButtonAction,   // tap B0 = next mode
  modePrev: { button: 0, gesture: 'hold' } as ButtonAction,  // hold B0 = previous mode
  undo:     { button: 3, gesture: 'tap' } as ButtonAction,   // tap B3 = undo
};

/** Per-mode button roles. "primary" is the main action button, "secondary" the modifier. */
export const MODE_BUTTONS = {
  primary: 1,   // GRAB: hold = move.  BUILD/ERASE: tap = place/delete.  ORBIT/GRAB/SCALE: tap = select
  secondary: 2, // BUILD: tap = cycle primitive
};

export const MODE_ORDER = ['FLY', 'ORBIT', 'GRAB', 'SCALE', 'BUILD', 'ERASE'] as const;
export type ModeName = (typeof MODE_ORDER)[number];

export const MODE_COLORS: Record<ModeName, string> = {
  FLY:   '#e87d0d',  // Blender orange
  ORBIT: '#5680c2',  // Blender selection blue
  GRAB:  '#ff9f3c',
  SCALE: '#8bdc00',  // Blender Y-axis green
  BUILD: '#ffd43b',
  ERASE: '#ff3352',  // Blender X-axis red
};

export const MODE_HINTS: Record<ModeName, string> = {
  FLY:   'Tap B1 (pinky): MOVE X → ROTATE → MOVE Y → ROTATE → MOVE Z … · tilt to move or look',
  ORBIT: 'Tilt to orbit the selection · tap B1 to select',
  GRAB:  'Hold B1 + move hand to drag · tilt to rotate · tap B1 to select',
  SCALE: 'Pitch up/down to scale · tap B1 to select',
  BUILD: 'Turn hand to aim · tap B1 to place · tap B2 to cycle shape',
  ERASE: 'Turn hand to aim · tap B1 to delete the object under the cursor',
};

/** Glove identity. The phone drives one glove. */
export const GLOVE_COLOR = '#e87d0d'; // Blender orange
export const GLOVE_DEFAULT_MODE: ModeName = 'FLY';

/** Button wiring on the glove, for the Test screen labels. */
export const BUTTON_GPIO = [13, 25, 27, 26];

/** Input processing. */
export const INPUT = {
  tapMaxMs: 500,          // press shorter than this = tap, longer = hold (B0 prev-mode, GRAB move)
  smoothing: 0.35,        // exponential filter alpha (0..1, higher = less smoothing)
  deadzoneDeg: 4,         // orientation below this magnitude is treated as zero
  maxTiltDeg: 60,         // clamp for roll/pitch after recentering
  invertPitch: false,     // flip if "hand up" moves the camera down on your glove
  invertRoll: true,       // glove roll reads backwards for this mounting
};

/** Bluetooth LE (Nordic UART Service). */
export const BLE = {
  namePrefix: 'Aloft',
  service: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
  rxCharacteristic: '6e400002-b5a3-f393-e0a9-e50e24dcca9e', // write (phone -> glove), unused for now
  txCharacteristic: '6e400003-b5a3-f393-e0a9-e50e24dcca9e', // notify (glove -> phone)
  reconnectAttempts: 3,   // silent reconnects after an unexpected drop
  reconnectDelayMs: 1000,
  // --- mobile only ---
  scanTimeoutMs: 12000,   // give up scanning after this
  powerOnTimeoutMs: 5000, // wait this long for the Bluetooth radio to be powered on
  staleMs: 1500,          // show "no data" when no sample arrived for this long
  requestMtu: 185,        // Android: ask for a bigger MTU so a 50 Hz line fits one notification
};

/** Touch simulator tuning (mobile replacement for the keyboard/mouse simulator). */
export const SIM = {
  touchDegPerPixel: 0.35,   // one-finger drag: roll from dx, pitch from dy
  yawDegPerPixel: 0.35,     // two-finger horizontal drag: yaw from dx
  springBack: true,         // return roll/pitch to level when the finger lifts (like relaxing your hand)
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
export type RotateStyle = 'rate' | 'absolute';
export const FLY = {
  axisCycleButton: 1,                       // B1 = pinky button (GPIO 25 on the glove). Acts on the press edge.
  cycleCooldownMs: 200,                     // ignore a second press within this (contact bounce / double report)
  axisOrder: ['X', 'Y', 'Z'] as FlyAxis[],  // MOVE cycle order; ROTATE sits between each
  axisControl: { X: 'pitch', Y: 'roll', Z: 'roll' } as Record<FlyAxis, TiltInput>,
  // +1 or -1 per axis. Defaults: tilt forward (nose down) = +X, roll right = +Y (up), roll right = forward (-Z).
  axisSign: { X: -1, Y: 1, Z: -1 } as Record<FlyAxis, 1 | -1>,
  deadzoneDeg: 5,          // tilt below this does nothing; speed ramps smoothly from 0 past it
  fullTiltDeg: 45,         // tilt at which the camera moves at full speed
  speed: 14,               // units / s at full tilt
  minHeight: 0.6,
  rotate: {
    // 'rate': tilt sets a turn speed, the camera keeps turning while the hand is deflected.
    // 'absolute': the camera angle follows the hand angle 1:1 (times gain); turn 180°, it stays there.
    // Toggled live by the "Rotate" button; this is just the start-up default.
    style: 'rate' as RotateStyle,
    turnAxis: 'yaw' as TiltAxis,   // hand axis that turns the camera left/right
    lookAxis: 'roll' as TiltAxis,  // hand axis that looks up/down
    invertTurn: false,
    invertLook: false,
    yawRateDegPerSec: 90,          // rate style: at full turn-axis deflection
    pitchRateDegPerSec: 60,        // rate style: at full look-axis deflection
    absoluteGain: 1.0,             // absolute style: camera degrees per hand degree
  },
};

/**
 * Modes (besides FLY's ROTATE state) where the hand also turns the camera.
 * Only modes that do not already use tilt for something else belong here:
 * ORBIT/GRAB/SCALE use tilt to orbit, move or scale, so they are left out.
 */
export const ROTATE_IN_MODES: ModeName[] = ['BUILD', 'ERASE'];
export const ORBIT = { azimuthDegPerSec: 90, elevationDegPerSec: 60 };
export const GRAB = { moveUnitsPerDeg: 0.08, rotateRadPerSecAtFull: 1.6 };
export const SCALE = { ratePerSec: 1.2, min: 0.1, max: 30 };
export const BUILD = {
  distance: 6,            // float distance when the cursor is not pointing at nearby ground
  maxDropDistance: 60,    // new objects fall onto the first surface this far below the cursor point
  primitives: ['cube', 'sphere', 'cylinder'] as const,
};
export type PrimitiveName = (typeof BUILD.primitives)[number];

/** Build plaza: a ring on the ground in front of the start position. */
export const BUILD_AREA = { center: { x: 0, y: 0, z: -28 }, radius: 12 };

/** Camera start pose (world units / radians). */
export const CAMERA = { fov: 70, near: 0.1, far: 2000, start: { x: 0, y: 5, z: 6 }, startPitch: -0.08 };

/** Rendering (mobile only). */
export const RENDER = {
  shadows: true,          // directional-light shadows; turn off on a slow phone
  shadowMapSize: 1024,    // web uses 2048
  maxPixelRatio: 2,
  maxFrameDt: 0.05,       // clamp a long frame so a hitch does not teleport the camera
  fogDensity: 0.006,
  background: 0x3d3d3d,
};

/** HUD / UI (mobile only). */
export const UI = {
  hudRefreshHz: 20,       // how often React re-reads engine state for the overlays and bottom sheet
  toastMs: 1400,
  gizmoSize: 110,         // px, square in the top-right corner
  gizmoMargin: 12,        // px from the edges
  speechRate: 1.15,
  speechPitch: 1.0,
  speechVolume: 0.9,
  speechDebounceMs: 400,  // identical phrase within this is skipped
  undoLimit: 100,
};

/** Test screen (mirrors the web /test.html). */
export const TEST = {
  presets: ['still', 'turn left', 'turn right', 'roll left', 'roll right', 'pitch up', 'pitch down',
    'press B0', 'hold B0', 'press B1', 'hold B1', 'press B2', 'press B3'],
  logLines: 40,           // event log depth shown on screen
  traceEveryMs: 500,      // report trace spacing
  traceMaxLines: 300,     // trace truncated after this many lines (150 s)
  gapMs: 200,             // a sample gap longer than this counts as a dropout
};
