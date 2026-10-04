/**
 * Aloft configuration. Edit button mappings and tuning here.
 * Button indices are 0..3 and match the firmware bitmask (bit n = button n).
 */

export type Gesture = 'tap' | 'hold' | 'press';   // press = act the instant the button goes down

export interface ButtonAction {
  button: number;
  gesture: Gesture;
}

/** Glove buttons: which pin does which job is set live in the glove panel (src/input/buttonMap.ts). */

/** Global actions that work in every mode. */
export const GLOBAL_ACTIONS = {
  // B0 advances the mode the instant it is pressed. Measured presses on this glove last ~1 s,
  // so a tap/hold split on the same button made every long press go backwards instead.
  modeNext: { button: 0, gesture: 'press' } as ButtonAction,
  // Logical buttons 4 and 5 only exist when a glove pin is assigned UNDO or PREV.
  modePrev: { button: 5, gesture: 'press' } as ButtonAction | null,
  // B3 = the pinky (GPIO 27): back to the start view and zero roll/pitch/yaw.
  reset:    { button: 3, gesture: 'press' } as ButtonAction,
  undo:     { button: 4, gesture: 'press' } as ButtonAction | null,
};

/** Per-mode button roles. "primary" is the main action button. */
export const MODE_BUTTONS = {
  primary: 1,   // FLY: pinky MOVE/ROTATE cycle.  BUILD/ERASE: place/delete.
};

/**
 * Sensitivity: one multiplier on every hand-driven rate (turn, look, move).
 * B2 (ring finger, GPIO 26) cycles through the levels in every mode except BUILD, where B2 cycles the piece
 * size instead; the toolbar button always cycles sensitivity.
 */
export const SENSITIVITY = {
  button: 2,
  levels: [1, 0.8, 0.6, 0.4, 0.2, 0],   // B2 steps down 0.2 at a time, then wraps back to 1
  startIndex: 0,
  holdResetMs: 1200,     // hold the SENS button this long to reset view, glove and sensitivity
  holdResetLevel: 1,     // sensitivity after a hold-reset (set 0 to freeze movement instead)
};
/** Mutable runtime state (changed live by buttons / UI, not a tuning constant). */
export const RUNTIME = { sensitivity: SENSITIVITY.levels[SENSITIVITY.startIndex] };

// Left to right like the V2 fingertips (index BUILD, middle ERASE, ring FLY). The MODE button still
// cycles FLY -> BUILD -> ERASE -> FLY (the same loop, just shown starting at BUILD).
export const MODE_ORDER = ['BUILD', 'ERASE', 'FLY'] as const;
export type ModeName = (typeof MODE_ORDER)[number];

export const MODE_COLORS: Record<ModeName, string> = {
  FLY:   '#e87d0d',  // Blender orange
  BUILD: '#ffd43b',
  ERASE: '#ff3352',  // Blender X-axis red
};

export const MODE_HINTS: Record<ModeName, string> = {
  FLY:   'Tilt to turn and look · option: X / Y / Z · sens: speed, hold to reset',
  BUILD: 'Aim with your hand · place · option: shape · sens: size, hold to reset',
  ERASE: 'Aim the eraser · erase what it touches · sens: size, hold to reset',
};

/** World units: 1 three.js unit = 1 cm. The floor grid, readouts and STL export use this. */
export const UNITS = { name: 'cm', gridMinorCm: 1, gridMajorCm: 10, gridExtentCm: 600, labelEveryCm: 10, labelRangeCm: 100, stlScale: 10 /* cm -> mm for slicers */ };

/** Glove identity. Up to two gloves. */
export const GLOVE_COLORS = ['#e87d0d', '#5680c2']; // Blender orange, Blender selection blue
export const GLOVE_DEFAULT_MODE: ModeName[] = ['FLY', 'BUILD'];
export const MAX_GLOVES = 2;

/** Input processing. */
export const INPUT = {
  tapMaxMs: 500,          // press shorter than this = tap, longer = hold
  smoothing: 0.35,        // exponential filter alpha (0..1, higher = less smoothing)
  deadzoneDeg: 4,         // orientation below this magnitude is treated as zero
  maxTiltDeg: 60,         // clamp for roll/pitch after recentering
  invertPitch: false,     // flip if "hand up" moves the camera down on your glove
  invertRoll: false,      // flip if rolling right reads negative on the panel
  connectSettleMs: 1000,  // after a connect the pose is zeroed on the first sample and again after this long
};

/** X2D voice assistant (ElevenLabs Agents). The agent is public, so only its id is needed. */
export const VOICE = {
  agentId: 'agent_8201m413w8nyf63thnzzcrexwx1t',   // "Aloft X2D" in the ElevenLabs dashboard
  wakeWords: ['x2d', 'x 2 d', 'x two d', 'x to d', 'x too d', 'ex 2 d', 'ex two d', 'extudy'],
  lang: 'en-US',
  // The only voice is the ElevenLabs agent: the app itself never speaks (no browser text-to-speech
  // for modes, axes, sizes or Gemini answers). Set true to bring the spoken cues back.
  localSpeech: false,
  autoListen: true,       // start watching for the wake word as soon as the page loads (asks for the mic once)
  // "X2D" alone opens a voice session with the agent, but speech-to-text often splits "X2D, make it a stickman" into two
  // results. Wait this long for the request before opening the session, so the request goes to Gemini and not to the agent.
  requestGraceMs: 1500,
  // Flow: you -> ElevenLabs agent -> Gemini -> pieces. When true, "X2D, make me a stickman" opens a session and hands
  // the request to the agent, which calls the build_scene client tool (see README for the dashboard setup).
  // When false, a request spoken with the wake word skips the agent and goes straight to Gemini.
  routeViaAgent: true,
  /** Client tools the agent can call. The names must match the tools defined on the agent in the ElevenLabs dashboard. */
  tools: { build: 'build_scene', describe: 'describe_scene', undo: 'undo_last', control: 'set_control', devices: 'show_devices' },
  // The agent no longer asks "are you still there?" (its turn timeout is -1 in the dashboard). Instead, when nobody
  // has spoken for this long during a session, the page plays a short whistle. Once per quiet stretch; 0 = off.
  idleWhistleMs: 15000,
  whistleVolume: 0.12,
};

/**
 * Every shape the app can place: the plain shapes, then the electronics kit modelled at real
 * size in src/scene/parts.ts. BUILD.quickShapes is the short list the glove OPTION button and the
 * SHAPE chips cycle; the device library lists BUILD.devices.
 */
export const ALL_SHAPES = ['cube', 'sphere', 'cylinder', 'nano', 'led', 'button', 'rpi', 'esp32', 'uno', 'servo', 'breadboard', 'pot', 'buzzer', 'ultrasonic', 'battery', 'resistor', 'jumper', 'motor', 'ldr', 'lcd'] as const;

/** Gemini (Google AI Studio). Key lives in .env.local as VITE_GEMINI_API_KEY. */
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
  // retry delay Google sends). Remembered in localStorage, as is the last model that worked, which is tried first.
  quotaStoreKey: 'aloft.gemini.quota',
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
            shape: { type: 'STRING', enum: [...ALL_SHAPES] },
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
    `Piece format: {"shape":"${ALL_SHAPES.join('|')}",` + '"size":[w,h,d],"pos":[x,y,z],"rot":[rx,ry,rz],"color":"#rrggbb"}.',
    'nano, led and button are ready-made Arduino kit parts at real size: nano = an Arduino Nano board, size [4.4,1.4,1.8] (pins point',
    'down); led = a 5 mm LED with legs, size [0.6,3.7,0.6], color is the LED colour; button = a 12 mm push button with a round cap,',
    'size [1.35,1.3,1.2], color is the cap colour. Keep their proportions (multiply all three sizes by one factor to resize). When asked to',
    'turn a piece into one of these, keep its x and z, replace its shape, and set y to half its height so it rests on the floor (or on the piece below).',
    'The rest of an electronics kit is ready-made at real size too (size [w,h,d] in cm, long side along x, pins and legs down):',
    'rpi = Raspberry Pi 4 [8.8,1.7,5.7]; esp32 = ESP32 DevKit [5.3,1.4,2.8]; uno = Arduino Uno [7.6,1.3,5.3]; servo = SG90 micro servo',
    'with its horn [4.5,3.1,1.2]; breadboard = half-size breadboard [8.3,0.9,5.5]; pot = potentiometer [1.6,3,1.7]; buzzer [1.2,2.4,1.2];',
    'ultrasonic = HC-SR04 distance sensor standing up, its two eyes facing +z [4.5,2.8,1.6]; battery = 9 V battery standing up, color is',
    'the label [2.7,5.2,1.8]; resistor [1.5,1.1,0.3]; jumper = jumper wire bent into an arch, color is the wire [5.3,4.6,0.3];',
    'motor = small DC motor, shaft along -x [4,2,2]; ldr = photoresistor [0.5,3.1,0.5]; lcd = 16x2 character LCD, screen up [8,1.8,3.6].',
    'Use one piece per part, never rebuild them from cubes.',
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
 */
export const ROTATE_IN_MODES: ModeName[] = ['BUILD', 'ERASE'];
/** ERASE: a see-through eraser (shape from the SHAPE chips) deletes every piece it touches. */
export const ERASE = {
  sizeScale: { small: 1, medium: 2.5, large: 6 } as Record<'small' | 'medium' | 'large', number>,   // cube eraser = 2 / 5 / 12 cm
  color: '#ff3352',
  opacity: 0.3,
};
export const BUILD = {
  maxAimDistance: 400,    // the crosshair ray places the piece on whatever it hits within this range (cm)
  distance: 6,            // fallback float distance (cm) when the crosshair points at nothing
  maxDropDistance: 60,    // fallback: new objects fall onto the first surface this far below the point
  primitives: ALL_SHAPES,
  // The glove OPTION button and the SHAPE chips cycle only these; every kit part is in the device library.
  quickShapes: ['cube', 'sphere', 'cylinder'] as PrimitiveName[],   // glove OPTION + SHAPE chips; kit parts by voice / device list
  devices: ['rpi', 'esp32', 'uno', 'nano', 'breadboard', 'servo', 'motor', 'ultrasonic', 'lcd', 'pot', 'buzzer', 'ldr', 'resistor', 'led', 'button', 'jumper', 'battery'] as PrimitiveName[],
  // Piece size. In BUILD, B2 cycles small -> medium -> large (elsewhere B2 is sensitivity).
  sizes: ['small', 'medium', 'large'] as const,
  sizeScale: { small: 0.5, medium: 1, large: 2 } as Record<'small' | 'medium' | 'large', number>,
  defaultSize: 'medium' as 'small' | 'medium' | 'large',
};
export type PrimitiveName = (typeof ALL_SHAPES)[number];
export type SizeName = (typeof BUILD.sizes)[number];

/** Saved projects (browser storage, no backend). */
export const PROJECTS = {
  storePrefix: 'aloft.project.',   // one localStorage entry per project: aloft.project.<id>
  indexKey: 'aloft.projects',      // list of ids, newest first
  autosaveMs: 1500,                // once a project is saved/opened, changes save themselves this long after the last edit
  thumbWidth: 320,                 // dashboard thumbnail (JPEG) width in px
  thumbQuality: 0.72,
  showDashboardOnStart: true,      // open the dashboard at start-up when there are saved projects (to continue one)
};

/** Start (and B3 reset / new project) camera pose: position in cm, look-down pitch in radians. */
export const CAMERA_START = { pos: [0, 10, 6] as [number, number, number], yaw: 0, pitch: -0.2 };
