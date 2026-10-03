/**
 * Aloft configuration. Edit button mappings and tuning here.
 * Button indices are 0..3 and match the firmware bitmask (bit n = button n).
 */

export type Gesture = 'tap' | 'hold';

export interface ButtonAction {
  button: number;
  gesture: Gesture;
}

/** Global actions that work in every mode. */
export const GLOBAL_ACTIONS = {
  modeNext: { button: 0, gesture: 'tap' } as ButtonAction,
  modePrev: { button: 0, gesture: 'hold' } as ButtonAction,
  undo:     { button: 3, gesture: 'tap' } as ButtonAction,
};

/** Per-mode button roles. "primary" is the main action button, "secondary" the modifier. */
export const MODE_BUTTONS = {
  primary: 1,   // FLY: hold = forward.  GRAB: hold = move.  BUILD/ERASE: tap = place/delete.  ORBIT/GRAB/SCALE: tap = select
  secondary: 2, // FLY: hold = boost.  BUILD: tap = cycle primitive
};

export const MODE_ORDER = ['FLY', 'ORBIT', 'GRAB', 'SCALE', 'BUILD', 'ERASE'] as const;
export type ModeName = (typeof MODE_ORDER)[number];

export const MODE_COLORS: Record<ModeName, string> = {
  FLY:   '#4cc9f0',
  ORBIT: '#b388ff',
  GRAB:  '#ff9f43',
  SCALE: '#5be37e',
  BUILD: '#ffe066',
  ERASE: '#ff5c7a',
};

export const MODE_HINTS: Record<ModeName, string> = {
  FLY:   'Tap B1 (pinky): MOVE X → ROTATE → MOVE Y → ROTATE → MOVE Z … · tilt to move or look',
  ORBIT: 'Tilt to orbit the selection · tap B1 to select',
  GRAB:  'Hold B1 + move hand to drag · tilt to rotate · tap B1 to select',
  SCALE: 'Pitch up/down to scale · tap B1 to select',
  BUILD: 'Turn hand to aim · tap B1 to place · tap B2 to cycle shape',
  ERASE: 'Turn hand to aim · tap B1 to delete the object under the cursor',
};

/** Glove identity. Up to two gloves. */
export const GLOVE_COLORS = ['#4cc9f0', '#ff4fd8'];
export const GLOVE_DEFAULT_MODE: ModeName[] = ['FLY', 'BUILD'];
export const MAX_GLOVES = 2;

/** Input processing. */
export const INPUT = {
  tapMaxMs: 500,          // press shorter than this = tap, longer = hold (B0 prev-mode, GRAB move)
  smoothing: 0.35,        // exponential filter alpha (0..1, higher = less smoothing)
  deadzoneDeg: 4,         // orientation below this magnitude is treated as zero
  maxTiltDeg: 60,         // clamp for roll/pitch after recentering
  invertPitch: false,     // flip if "hand up" moves the camera down on your glove
  invertRoll: true,       // glove roll reads backwards for this mounting
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
  axisCycleButton: 1,                       // B1 = pinky button (GPIO 14 on the glove). Acts on the press edge.
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
    // Toggled live by the "Rotate" toolbar button; this is just the start-up default.
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
export type RotateStyle = 'rate' | 'absolute';

/**
 * Modes (besides FLY's ROTATE state) where glove 1's hand also turns the camera.
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
