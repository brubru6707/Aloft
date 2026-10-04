# Aloft

Navigate and build in 3D with your hand instead of a mouse. A hardware glove
(ESP32 + MPU-6050 + four buttons) streams orientation over Bluetooth LE; the
browser turns it into a drone-style camera, an object manipulator, and a
primitive builder. No backend.

Hackathon theme: *What do we build next to change how we navigate in the next 100 years?*

## Run

```bash
npm install
npm run dev
```

Open the printed URL in **Chrome on macOS** (Web Bluetooth needs Chrome, and
`localhost` counts as a secure origin). `npm run build` type-checks and
produces a static bundle in `dist/`.

No glove? Click **Simulator** on a glove panel and drive it from the keyboard:

| Input | Effect |
| --- | --- |
| `←` `→` | roll (springs back to level on release) |
| `↑` `↓` | pitch (springs back) |
| `Q` `E` | yaw |
| mouse drag on the scene | roll / pitch |
| `1` … `9`, `0` | button jobs MODE, ACTION, SENS (hold = reset all), RESET, UNDO, PREV, OPTION, FLY, BUILD, ERASE |
| `Tab` / `Shift+Tab`, `R`, `Cmd+Z` | next/prev mode, recenter, undo (desktop shortcuts) |

## Glove layouts (V1 and V2)

Two right-hand gloves, each with its own Bluetooth name and pinout. The firmware reports the
glove version in every line (`roll,pitch,yaw,mask,version`), so the app always knows which pin
is which. Build V1 with `--build-property "compiler.cpp.extra_flags=-DGLOVE_VERSION=1"`.

| Glove | Bluetooth name | Pins |
|---|---|---|
| V1 | `Aloft-V1` | 13 index, 25 middle, 26 ring, 27 pinky |
| V2 | `Aloft-V2` | index side 14 (bottom), 32 (middle), 13 (top); fingertips 25 index, 33 middle, 26 ring; 27 middle finger, thumb side |

Layouts, switched by voice ("X2D, backup V2"), by typing, or from the glove panel:

| Layout | Buttons |
|---|---|
| Default V1 | 13 mode, 25 action, 26 sensitivity, 27 reset |
| Default V2 | index side (14, 32, 13) option; 25 BUILD, 33 ERASE, 26 FLY (press again in that mode to place / erase / toggle rotate-move); 27 sensitivity |
| Backup V2 | side: 13 mode, 32 option, 14 sensitivity; tips: 25 mode, 33 option, 26 sensitivity; 27 action |

Option = next shape (BUILD, ERASE) or next direction X / Y / Z (FLY). Sensitivity: tap = speed
(FLY) or size (BUILD, ERASE); **hold 1.2 s = reset everything** (start view, roll / pitch / yaw
zeroed, sensitivity back to 1×). Every pin can also be changed by clicking its chip.

## Modes

Press **B0** for the next mode (previous mode: click a mode chip in the glove panel, or Shift+Tab). The mode name is
spoken aloud and shown large in the top-left, color-coded.

| Mode | Color | Controls |
| --- | --- | --- |
| **FLY** (default) | cyan | tap **B1** (pinky) to alternate `MOVE: X` → `ROTATE` → `MOVE: Y` → `ROTATE` → `MOVE: Z` → `ROTATE` … (shown large and spoken). MOVE translates along that one world axis: X (left/right) from roll, Y (up/down) and Z (forward/back) from pitch (hand up = up, tilt forward = forward). ROTATE turns the camera with hand roll (roll right = turn right) and looks up/down with pitch. Deadzone, tilt mapping, signs and rates live in `FLY` in `src/config.ts` |
| **BUILD** | yellow | hand rotates the camera to aim (same rate/absolute style as FLY); tap **B1** places a primitive where the crosshair points: on top of the ground or piece you aim at (so pieces stack), or stuck to the side you aim at, at that height, so you can build outwards; the shape is chosen with the SHAPE chips in the glove panel (cube, sphere, cylinder, or the Arduino kit parts: **nano** = Arduino Nano, **led** = 5 mm LED, **button** = 12 mm push button, all at real size; the colour paints the LED / button cap) and **B2** (or the SIZE chips) cycles small / medium / large. Say "X2D, use an Arduino Nano" to switch shape, or "turn the sphere into an Arduino Nano" to convert a piece |
| **ERASE** | red | hand aims a red see-through eraser (shape from the SHAPE chips, size from **B2** or the SIZE chips: 2 / 5 / 12 cm); every piece it touches turns red and **B1** erases them all as one undo step |

**B2** cycles the sensitivity multiplier (1×, 0.8×, 0.6×, 0.4×, 0.2×, 0×, also a toolbar button) and **B3** (GPIO 27, the pinky) resets the view: camera back to the start position and roll / pitch / yaw zeroed. Undo is the toolbar button, Cmd+Z, or saying "undo that" (build, move, rotate, erase). All mappings
and tuning live in [`src/config.ts`](src/config.ts).

The crosshair in the screen center is glove 1's cursor. A second glove gets its
own colored cursor that it steers with hand tilt, its own mode, and its own
build color, so one person can fly while the other builds.

Toolbar: **Undo**, **Recenter** (zero every glove's orientation; also per glove),
**Rotate: rate / absolute** (FLY rotation style: *rate* keeps turning while the hand
is deflected, *absolute* makes the camera follow the hand angle 1:1 so a 180° turn
of the hand stays a 180° turn), **Export STL** (downloads every user-built object
as one binary STL, scaled from the world's centimetres to millimetres for slicers).

The world is in **centimetres** (1 unit = 1 cm). The floor is a CAD-style grid with
1 cm minor and 10 cm major lines, labelled every 10 cm along X (red) and Z (blue).
A medium cube is 2 cm; small is 1 cm and large is 4 cm. While building, the glove
panel shows the piece size and the ghost's position in cm.

A small world-axes gizmo sits top-right under the toolbar. It turns with the camera so
you can always see where world X (red), Y (green) and Z (blue) point; in FLY the active
MOVE axis is drawn bright and thick and the end you are moving toward grows. The glove
panel's FLY row shows the same state as chips plus a bar of the current move amount.


## Projects

**💾 Save** (or Cmd/Ctrl+S) stores the current build: every piece, the camera and a thumbnail.
The first save asks for a name in the dashboard; after that the project **autosaves** about
1.5 s after each change (the toolbar shows the project name, with a dot while changes are
pending). **📁 Projects** opens the dashboard: one card per project with its thumbnail, piece
count and last edit; **Open** (or **Continue** for the one you are in), click the name to rename,
**Delete** asks once more on the same button. **＋ New empty project** clears the scene. Opening
another project or starting a new one never loses work: an unnamed build is kept as
"Unsaved build …". When saved projects exist the dashboard opens at start-up so you can pick up
where you left off. Projects live in this browser's localStorage (no backend), so they are per
browser and per computer. Settings are under `PROJECTS` in `src/config.ts`.

## X2D voice assistant and Gemini

- **X2D** (ElevenLabs Agents + Gemini): the page watches for the wake word "X2D" with
  Chrome's built-in speech recognition (local, free). Say **"X2D" on its own** (or click
  **🎙 X2D**) and a voice session opens with the public "Aloft X2D" agent, which answers
  "Hello" and listens; click the button again to hang up. Say **"X2D, …" followed by a
  request**, e.g. *"X2D, I made a stickman but it looks ugly, make it an actual stickman"*,
  and the whole sentence goes to Gemini together with every piece you built (shape, size,
  position, colour). Gemini either answers out loud or returns a complete new layout, which
  replaces your pieces as one undoable step (Undo takes it back). The ask box does the same with
  typed text. The agent id and wake
  word spellings are under `VOICE` in `src/config.ts`; the agent itself is edited in the
  ElevenLabs dashboard (prompt, voice, LLM). Chrome asks for the microphone once.
- **Gemini**: the **✨ ask Gemini…** box in the toolbar takes the same requests as "X2D, …".
  A question ("how many pieces are there?") gets a spoken answer; anything that reads as an
  instruction ("make it an actual stickman", "build me a small table") makes Gemini return the
  finished layout, which replaces your pieces as one undoable step. It never coaches you: it is
  the builder. Under the hood the request goes out with Gemini structured output (a JSON schema
  with `action`, `message`, `pieces`), a client-side classifier forces `rebuild` for imperative
  requests, and an unusable reply (an answer to an instruction, or a rebuild with no pieces) is
  re-asked once. Put your key in `.env.local` as `VITE_GEMINI_API_KEY=…` (see `.env.example`;
  the file is git-ignored) and restart `npm run dev`. Model chain, schema, prompt and the
  classifier are under `GEMINI` in `src/config.ts`. Free-tier keys allow about 20 requests per
  day per model, and the newest flash is often overloaded (503), so requests fall through
  `GEMINI.fallbackModels`. For debugging, `window.__lastGeminiRaw` holds the last raw reply and
  the model that produced it, and `window.__aloft.askAssistant("…")` returns the plan.
  Anything in a browser bundle is visible to whoever loads the page, so this is for local use.

## Glove test bench

Open **`/test.html`** (e.g. `http://localhost:5173/test.html`) for a page with no 3D
scene that just talks to the glove. Use it to check wiring, directions and drift
without the app in the way, and to produce a report you can paste into a chat.

- **Connect BLE** or **Connect USB** (Web Serial; the firmware echoes the same stream
  on USB, and opening the port resets the glove, so wait ~2 s and keep it still).
- Live raw roll / pitch / yaw with bars, the same values as the app sees them after
  recenter, invert and smoothing, and the four button chips with their GPIO numbers.
- **Start recording**, then tap a preset marker (`still`, `turn left`, `press B0`, …)
  or type your own just before each movement. **Stop** builds the report.
- The report lists per-axis stats, one line per marker segment (how much roll, pitch
  and yaw changed and the yaw rate, so drift and reversed axes are obvious), every
  button press with its duration, the app's tap/hold classification events, and a
  0.5 s trace. **Copy report** puts it on the clipboard.

### Refining, silence and the whistle

After something is built, ask for changes in plain words ("make the arms longer", "give it a hat",
"make it red"): build_scene sends Gemini the current pieces with the request and it rebuilds from
them, one undo step per change. The agent's "Take turn after silence" is set to -1 in the dashboard
so it never asks "are you still there?"; instead the page whistles once when nobody has spoken for
`VOICE.idleWhistleMs` (15 s; a running build does not count as silence). Set it to 0 to turn the
whistle off. `__aloft.whistle()` in the console plays it.

### Letting the agent build (ElevenLabs dashboard setup)

The flow is **you → X2D agent → Gemini → pieces in the scene**. The page registers three
*client tools* with the agent session (`VOICE.tools` in `src/config.ts`). The agent can only
call them once they are also defined on the agent in the ElevenLabs dashboard
(Agents → Aloft X2D → Tools → Add tool → **Client**), each with **Wait for response** on:

| Name | Description (what the agent reads) | Parameters |
| --- | --- | --- |
| `build_scene` | Builds or changes the 3D scene in Aloft. Call it whenever the user asks you to make, build, add, change, fix, move or remove anything. Pass their request in their own words. | `request` (string, required): what to build or change, e.g. "a stickman" or "make the arms longer" |
| `describe_scene` | Returns what is currently built (pieces, sizes and positions in cm). Call it before answering questions about the scene. | none |
| `undo_last` | Undoes the last change to the scene. | none |

Set the `build_scene` response timeout to about 60 s (Gemini can take 10–30 s for a layout).
Then add to the agent's system prompt:

> You are X2D, the voice of Aloft, a 3D building app measured in centimetres. You cannot draw
> images, but you CAN build 3D objects: whenever the user asks for something to be made or
> changed, call `build_scene` with their request, then tell them in one short sentence what you
> built, using the tool's reply. Never tell the user to build it themselves. Use
> `describe_scene` for questions about what is built and `undo_last` when they want to undo.

"X2D, make me a stickman" spoken in one breath opens a session and hands the request to the
agent as its first message (`VOICE.routeViaAgent`; set it to `false` to send wake-word
requests straight to Gemini as before). The **✨ ask Gemini** box still goes straight to Gemini.

## BLE protocol

The glove advertises as `Aloft-Glove` with the Nordic UART Service.

| | UUID |
| --- | --- |
| Service | `6E400001-B5A3-F393-E0A9-E50E24DCCA9E` |
| TX (glove → app, notify) | `6E400003-B5A3-F393-E0A9-E50E24DCCA9E` |
| RX (app → glove, write) | `6E400002-B5A3-F393-E0A9-E50E24DCCA9E` (unused) |

Each notification carries ASCII text. Lines are terminated by `\n` and may be
split or merged across notifications; the app buffers and splits on newline.

```
roll,pitch,yaw,buttonsBitmask\n
```

- `roll`, `pitch`, `yaw`: degrees as decimal numbers (e.g. `12.3`, `-4.8`).
  Roll and pitch come from a complementary filter; yaw is integrated gyro and
  drifts, so use **Recenter** in the app.
- `buttonsBitmask`: integer, bit *n* set = button *n* pressed (`5` = B0 and B2).
- Rate: 50 Hz.

Client side the app zeroes roll/pitch/yaw automatically when a glove connects (on the
first sample and again a second later), applies an exponential smoothing filter, a deadzone,
per-glove recentering, and classifies each button press as a **tap**
(< 250 ms) or a **hold**. If a BLE link drops it retries the same device three
times before giving up. Everything input-related is in [`src/input/`](src/input/).

## Firmware

[`firmware/glove/glove.ino`](firmware/glove/glove.ino) — ESP32 Arduino sketch.

- MPU-6050 (GY-521) on I2C, SDA = GPIO 21, SCL = GPIO 22.
- Buttons on GPIO 13 (B0 = mode), 25 (B1 = pinky / axis-cycle), 27 (B2), 26 (B3) to GND, `INPUT_PULLUP` (pressed = LOW). GPIO 12 is a boot strapping pin, so it is avoided; unwired buttons read as released.
- Library: **NimBLE-Arduino** (h2zero) from the Library Manager. No IMU library needed.
- Keep the glove still for about a second at power-on while it calibrates the gyro.
  A pass is rejected and retried if the glove moved, and the bias keeps re-learning
  whenever the glove rests, so yaw should not creep when your hand is still.
- The same line stream is echoed on USB serial at 115200 baud for debugging.

## 60-second demo script

1. **(0:00)** Load the page. "This is Aloft. The question was how we navigate
   in the next hundred years. Our answer: you stop pointing at a screen and just
   use your hand." Click **Connect Glove**, pick `Aloft-Glove`. The HUD shows
   live roll, pitch, yaw.
2. **(0:10)** FLY. Turn your hand to look down a street. Tap B1 (pinky):
   *"x"*, tilt forward to slide along it. Tap: *"rotate"*, look up at a tower.
   Tap: *"y"*, roll to rise above it. "One axis at a time, one tilt, no joystick."
3. **(0:30)** Fly to the glowing plaza. Tap B0 to *"build"*. Place a cube,
   pick sphere in the panel, place one on top, press B2 for a large one. Press Undo to take back the last change.
4. **(0:50)** Hand the second glove to a teammate: a magenta cursor appears and
   they drop shapes while you keep flying. "Two people, one world, no mice."
5. **(0:55)** Click **Export STL**. "And what you built is a real file you can
   print. That's navigating and building in 3D, with your hand."
