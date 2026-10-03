/**
 * Aloft mobile configuration. Every tunable lives here.
 * Ported from the web app's src/config.ts; mobile-only sections are marked.
 * Button indices are 0..3 and match the firmware bitmask (bit n = button n).
 */

export type Gesture = 'tap' | 'hold' | 'press';   // press = act the instant the button goes down

export interface ButtonAction {
  button: number;
  gesture: Gesture;
}

/**
 * Glove buttons in finger order. The firmware reports bit n = button n by pin (GPIO 13, 25, 27, 26),
 * but on this glove the pinky is GPIO 27 (bit 2) and the ring finger GPIO 26 (bit 3). BUTTON_MAP[i]
 * is the firmware bit read as app button Bi, so B0..B3 go index → middle → ring → pinky. The BLE
 * protocol itself is unchanged.
 */
export const BUTTON_MAP = [0, 1, 3, 2];

/** Global actions that work in every mode. */
export const GLOBAL_ACTIONS = {
  // B0 advances the mode the instant it is pressed. Measured presses on this glove last ~1 s,
  // so a tap/hold split on the same button made every long press go backwards instead.
  modeNext: { button: 0, gesture: 'press' } as ButtonAction,
  // Previous mode is not on the glove any more: tap a mode chip in the bottom sheet.
  modePrev: null as ButtonAction | null,
  // B3 = the pinky (GPIO 27): back to the start view and zero roll/pitch/yaw.
  reset:    { button: 3, gesture: 'press' } as ButtonAction,
  // Undo is on screen (Tools → Undo) and by voice ("undo that"); no glove button.
  undo:     null as ButtonAction | null,
};

/** Per-mode button roles. "primary" is the main action button. */
export const MODE_BUTTONS = {
  primary: 1,   // FLY: pinky MOVE/ROTATE cycle.  BUILD/ERASE: place/delete.  SCALE: select
};

/**
 * Sensitivity: one multiplier on every hand-driven rate (turn, look, move, scale).
 * B2 (ring finger, GPIO 26) cycles through the levels in every mode except BUILD, where B2 cycles the piece
 * size instead; the "⚡ Sens" button always cycles sensitivity.
 */
export const SENSITIVITY = {
  button: 2,
  levels: [0.5, 1, 1.5, 2],
  startIndex: 1,
};
/** Mutable runtime state (changed live by buttons / UI, not a tuning constant). */
export const RUNTIME = { sensitivity: SENSITIVITY.levels[SENSITIVITY.startIndex] };

export const MODE_ORDER = ['FLY', 'SCALE', 'BUILD', 'ERASE'] as const;
export type ModeName = (typeof MODE_ORDER)[number];

export const MODE_COLORS: Record<ModeName, string> = {
  FLY:   '#e87d0d',  // Blender orange
  SCALE: '#8bdc00',  // Blender Y-axis green
  BUILD: '#ffd43b',
  ERASE: '#ff3352',  // Blender X-axis red
};

export const MODE_HINTS: Record<ModeName, string> = {
  FLY:   'B1: MOVE X → ROTATE → MOVE Y → ROTATE → MOVE Z … · roll to turn, pitch to look · B2 sensitivity · B3 (pinky) reset',
  SCALE: 'Pitch up/down to scale · tap B1 to select',
  BUILD: 'Turn hand to aim · press B1 to place · B2 cycles size · shape in the panel',
  ERASE: 'Turn hand to aim · tap B1 to delete the object under the cursor',
};

/** World units: 1 three.js unit = 1 cm. The floor grid, readouts and STL export use this. */
export const UNITS = { name: 'cm', gridMinorCm: 1, gridMajorCm: 10, gridExtentCm: 600, labelEveryCm: 10, labelRangeCm: 100, stlScale: 10 /* cm -> mm for slicers */ };

/** Glove identity. The phone drives one glove. */
export const GLOVE_COLOR = '#e87d0d'; // Blender orange
export const GLOVE_DEFAULT_MODE: ModeName = 'FLY';

/** Button wiring on the glove, for the Test screen labels. */
export const BUTTON_GPIO = [13, 25, 26, 27];   // pin behind each app button after BUTTON_MAP (B3 = pinky)

/** Input processing. */
export const INPUT = {
  tapMaxMs: 500,          // press shorter than this = tap, longer = hold
  smoothing: 0.35,        // exponential filter alpha (0..1, higher = less smoothing)
  deadzoneDeg: 4,         // orientation below this magnitude is treated as zero
  maxTiltDeg: 60,         // clamp for roll/pitch after recentering
  invertPitch: false,     // flip if "hand up" moves the camera down on your glove
  invertRoll: false,      // the firmware already flips roll (SIGN_ROLL = -1); flip here only if rolling right reads negative
  connectSettleMs: 1000,  // after a connect the pose is zeroed on the first sample and again after this long
};

/** X2D voice assistant (ElevenLabs Agents). The agent is public, so only its id is needed. */
export const VOICE = {
  agentId: 'agent_8201m413w8nyf63thnzzcrexwx1t',   // "Aloft X2D" in the ElevenLabs dashboard
  wakeWords: ['x2d', 'x 2 d', 'x two d', 'x to d', 'x too d', 'ex 2 d', 'ex two d', 'extudy'],
  lang: 'en-US',
  // The only voice is the ElevenLabs agent: the app itself never speaks (no expo-speech cues for modes,
  // axes, sizes or Gemini answers). Set true to bring them back.
  localSpeech: false,
  // "X2D, make me a stickman" in one breath: open a session and hand the request to the agent, which
  // calls build_scene. Wait this long after a bare "X2D" for the request before opening the session.
  requestGraceMs: 1500,
  /** Client tools the agent can call; names must match the tools on the agent in the ElevenLabs dashboard. */
  tools: { build: 'build_scene', describe: 'describe_scene', undo: 'undo_last', control: 'set_control' },
  autoListen: true,       // start watching for the wake word as soon as the app opens (asks for the mic once)
};

/** Gemini (Google AI Studio). Key lives in .env.local as EXPO_PUBLIC_GEMINI_API_KEY (git-ignored). */
export const GEMINI = {
  // Free-tier keys get ~20 requests/day per model and the newest flash is often 503 (overloaded),
  // so the chain matters. gemini-3.1-pro-preview has no free quota (429) and gemini-2.5-flash is retired (404).
  model: 'gemini-3.5-flash',   // follows the JSON schema well and is rarely overloaded
  fallbackModels: ['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.8-flash', 'gemini-3-flash-preview', 'gemini-3.5-flash-lite'],   // tried in order on 503/404/429
  maxOutputTokens: 200,
  retries: 1,              // extra attempt per model on 503 (overloaded), then the next model. A 429 moves on at once.
  retryDelayMs: 800,       // pause before that one 503 retry
  // Builds use low thinking: same layouts in ~3-5 s instead of long thinking that often ends in 503 (overloaded).
  // 'minimal' | 'low' | 'medium' | 'high', or null to let the model decide. Plain answers never set it.
  planThinkingLevel: 'low' as 'minimal' | 'low' | 'medium' | 'high' | null,
  // A model that returns 429 is skipped until its quota resets (daily quotas: next midnight Pacific; per-minute: the
  // retry delay Google sends). Remembered while the app runs, as is the last model that worked, which is tried first.
  // Thinking tokens count against this limit on Gemini 3.x, so it must be far above the JSON itself (~40 pieces ≈ 2500 tokens).
  maxPlanTokens: 16000,
  maxPieces: 40,
  /** Requests that read as an instruction about the scene are forced to action=rebuild (client-side classifier). */
  imperativePattern: /\b(make|build|fix|improve|rebuild|redo|remake|turn|add|give|change|refine|better|actual|proper|look like|looks like|replace|remove|delete|put|create|design|move|scale|resize|stretch|shrink|enlarge|rotate|colou?r|paint|convert|transform|upgrade|do it|clean|straighten|align|center|centre|smooth|taller|shorter|bigger|smaller|wider|thinner)\b/i,
  /** A request that opens like this is a question even if it contains one of the verbs above ("how many pieces make the arm?"). */
  questionPattern: /^\s*(how (many|big|tall|wide|long|far|high)|what('s| is| are| unit| colou?r| size| shape)|which|where|is there|are there|do i have|does it|count|tell me)\b/i,
  // Structured output (generationConfig.responseSchema). pieces is always present: [] for an answer.
  planSchema: {
    type: 'OBJECT',
    properties: {
      action: { type: 'STRING', enum: ['answer', 'rebuild'] },
      message: { type: 'STRING' },
      pieces: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            shape: { type: 'STRING', enum: ['cube', 'sphere', 'cylinder'] },
            size: { type: 'ARRAY', items: { type: 'NUMBER' } },
            pos: { type: 'ARRAY', items: { type: 'NUMBER' } },
            rot: { type: 'ARRAY', items: { type: 'NUMBER' } },
            color: { type: 'STRING' },
          },
          required: ['shape', 'size', 'pos', 'rot', 'color'],
          propertyOrdering: ['shape', 'size', 'pos', 'rot', 'color'],
        },
      },
    },
    required: ['action', 'message', 'pieces'],
    propertyOrdering: ['action', 'message', 'pieces'],
  },
  planPrompt: [
    'You are the BUILDER. The user cannot and will not build anything themselves: whatever they ask for, you produce the finished',
    'layout and the app places it. Never explain how to build, never list steps, never mention buttons, modes, gloves or tools.',
    'Reply with JSON only: {"action":"answer"|"rebuild","message":"...","pieces":[...]}.',
    'action="answer" ONLY for a genuine question about the scene (how many, how big, where, what unit, what colour). message answers',
    'it in one or two short sentences and pieces is [].',
    'action="rebuild" for ANY instruction, wish or complaint about the scene: make, fix, improve, rebuild, turn it into, add, give it,',
    'change, refine, better, actual, proper, look like, etc. Even when the scene is empty, build the thing from scratch at the plaza',
    'centre (x=0, z=-28). pieces is the COMPLETE new layout that replaces every current piece (at most 40). message is one short spoken',
    'sentence saying what you built, never an explanation.',
    'Piece format: {"shape":"cube|sphere|cylinder","size":[w,h,d],"pos":[x,y,z],"rot":[rx,ry,rz],"color":"#rrggbb"}.',
    'Units are centimetres. Y is up and the floor is y=0, so a piece\'s centre y must be at least h/2 (a tilted cylinder of length h',
    'rotated by a degrees about Z has centre y ≥ h/2·cos(a)). rot is degrees about x, y, z. A cube is a box w×h×d. A sphere uses w as',
    'its diameter. A cylinder stands along Y: size=[diameter,length,diameter]; rotate it about Z (or X) to make limbs. Limbs must',
    'CONNECT at joints: an arm of length L rotated by a degrees about Z, hanging from a shoulder at (sx,sy), has its centre at',
    '(sx + sin(a)·L/2, sy − cos(a)·L/2) with a negative angle for the left arm and a positive one for the right. Keep the new build near',
    'the old one\'s centre and roughly its overall height, keep the user\'s colour unless asked otherwise, and make every part touch its neighbour.',
    'Example 1. Request: "how many pieces are there?" with 7 cubes → {"action":"answer","message":"There are seven cubes, all 2 cm.","pieces":[]}',
    'Example 2. Request: "make it an actual stickman" with 7 orange cubes about 10 cm tall at z=-28 →',
    '{"action":"rebuild","message":"Here is your stickman.","pieces":[',
    '{"shape":"sphere","size":[2.6,2.6,2.6],"pos":[0,10.3,-28],"rot":[0,0,0],"color":"#e87d0d"},',
    '{"shape":"cylinder","size":[0.8,4.6,0.8],"pos":[0,6.7,-28],"rot":[0,0,0],"color":"#e87d0d"},',
    '{"shape":"cylinder","size":[0.6,4,0.6],"pos":[-1.4,7.6,-28],"rot":[0,0,-45],"color":"#e87d0d"},',
    '{"shape":"cylinder","size":[0.6,4,0.6],"pos":[1.4,7.6,-28],"rot":[0,0,45],"color":"#e87d0d"},',
    '{"shape":"cylinder","size":[0.7,4.6,0.7],"pos":[-0.7,2.2,-28],"rot":[0,0,-18],"color":"#e87d0d"},',
    '{"shape":"cylinder","size":[0.7,4.6,0.7],"pos":[0.7,2.2,-28],"rot":[0,0,18],"color":"#e87d0d"}]}',
  ].join(' '),
  /** Appended to the prompt when the client-side classifier decides the request is an instruction. */
  forceRebuildNote: 'The request below is an INSTRUCTION, not a question: action MUST be "rebuild" and pieces MUST hold the complete layout.',
  /** Second turn when the first reply was unusable. */
  reaskNoPieces: 'You returned action=rebuild with no pieces. Return the full piece list now, as JSON only.',
  reaskNotQuestion: 'This was an instruction, not a question. Return action=rebuild with the complete layout as JSON only.',
  answerToastMs: 6000,
  systemPrompt: 'You are the assistant inside Aloft, a hand-controlled 3D building app where the world is in centimetres. Answer in one or two short sentences, plain text, no markdown.',
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
    // Toggled live by the "Rotate" button; this is just the start-up default.
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

/**
 * Modes (besides FLY's ROTATE state) where the hand also turns the camera.
 * Only modes that do not already use tilt for something else belong here:
 * SCALE uses tilt to scale, so it is left out.
 */
export const ROTATE_IN_MODES: ModeName[] = ['BUILD', 'ERASE'];
export const SCALE = { ratePerSec: 1.2, min: 0.1, max: 30 };
export const BUILD = {
  maxAimDistance: 400,    // the crosshair ray places the piece on whatever it hits within this range (cm)
  distance: 6,            // fallback float distance (cm) when the crosshair points at nothing
  maxDropDistance: 60,    // fallback: new objects fall onto the first surface this far below the point
  primitives: ['cube', 'sphere', 'cylinder'] as const,
  // Piece size. In BUILD, B2 cycles small -> medium -> large (elsewhere B2 is sensitivity).
  sizes: ['small', 'medium', 'large'] as const,
  sizeScale: { small: 0.5, medium: 1, large: 2 } as Record<'small' | 'medium' | 'large', number>,
  defaultSize: 'medium' as 'small' | 'medium' | 'large',
};
export type PrimitiveName = (typeof BUILD.primitives)[number];
export type SizeName = (typeof BUILD.sizes)[number];

/** Build plaza: a ring on the ground in front of the start position. */
export const BUILD_AREA = { center: { x: 0, y: 0, z: -28 }, radius: 12 };

/** Camera start pose (world units / radians). */
export const CAMERA = { fov: 70, near: 0.1, far: 2000, start: { x: 0, y: 10, z: 6 }, startPitch: -0.2 };   // start (and B3 reset) pose: cm, radians

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
  gizmoSize: 84,          // px, square in the top-right corner (under the mode bar)
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
