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
  FLY:   'Tilt to steer · hold B1 forward · hold B2 boost',
  ORBIT: 'Tilt to orbit the selection · tap B1 to select',
  GRAB:  'Hold B1 + move hand to drag · tilt to rotate · tap B1 to select',
  SCALE: 'Pitch up/down to scale · tap B1 to select',
  BUILD: 'Tap B1 to place · tap B2 to cycle shape',
  ERASE: 'Tap B1 to delete the object under the cursor',
};

/** Glove identity. Up to two gloves. */
export const GLOVE_COLORS = ['#4cc9f0', '#ff4fd8'];
export const GLOVE_DEFAULT_MODE: ModeName[] = ['FLY', 'BUILD'];
export const MAX_GLOVES = 2;

/** Input processing. */
export const INPUT = {
  tapMaxMs: 250,          // press shorter than this = tap, longer = hold
  smoothing: 0.35,        // exponential filter alpha (0..1, higher = less smoothing)
  deadzoneDeg: 4,         // orientation below this magnitude is treated as zero
  maxTiltDeg: 60,         // clamp for roll/pitch after recentering
  invertPitch: false,     // flip if "hand up" moves the camera down on your glove
  invertRoll: false,
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
export const FLY = {
  yawRateDegPerSec: 90,    // at full roll
  pitchRateDegPerSec: 60,  // at full pitch
  speed: 14,               // units / s
  boost: 3,
  bankVisual: 0.6,         // how much the camera visually banks with roll
  minHeight: 0.6,
};
export const ORBIT = { azimuthDegPerSec: 90, elevationDegPerSec: 60 };
export const GRAB = { moveUnitsPerDeg: 0.08, rotateRadPerSecAtFull: 1.6 };
export const SCALE = { ratePerSec: 1.2, min: 0.1, max: 30 };
export const BUILD = {
  distance: 6,            // float distance when the cursor is not pointing at nearby ground
  maxDropDistance: 60,    // new objects fall onto the first surface this far below the cursor point
  primitives: ['cube', 'sphere', 'cylinder'] as const,
};
export type PrimitiveName = (typeof BUILD.primitives)[number];
