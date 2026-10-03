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
| `1` `2` `3` `4` | buttons B0–B3 (hold the key to hold the button) |
| `Tab` / `Shift+Tab`, `R`, `Cmd+Z` | next/prev mode, recenter, undo (desktop shortcuts) |

## Modes

Press **B0** for the next mode (previous mode: click a mode chip in the glove panel, or Shift+Tab). The mode name is
spoken aloud and shown large in the top-left, color-coded.

| Mode | Color | Controls |
| --- | --- | --- |
| **FLY** (default) | cyan | tap **B1** (pinky) to alternate `MOVE: X` → `ROTATE` → `MOVE: Y` → `ROTATE` → `MOVE: Z` → `ROTATE` … (shown large and spoken). MOVE translates along that one world axis: X from pitch (tilt forward/back), Y (up/down) and Z (forward/back) from roll. ROTATE turns the camera with hand roll (roll right = turn right) and looks up/down with pitch. Deadzone, tilt mapping, signs and rates live in `FLY` in `src/config.ts` |
| **ORBIT** | violet | tilt orbits the camera around the selected object (or the build plaza); tap **B1** selects what is under the cursor |
| **GRAB** | orange | tap **B1** to select; hold **B1** + tilt to move it; tilt without the button to rotate it |
| **SCALE** | green | pitch up/down scales the selection |
| **BUILD** | yellow | hand rotates the camera to aim (same rate/absolute style as FLY); tap **B1** places a primitive where the ghost preview sits (it drops onto the surface below, so pieces stack); the shape is chosen with the SHAPE chips in the glove panel and **B3** (or the SIZE chips) cycles small / medium / large |
| **ERASE** | red | hand rotates the camera to aim; tap **B1** deletes the object under the cursor |

**B3** cycles the sensitivity multiplier (0.5×, 1×, 1.5×, 2×, also a toolbar button) and **B2** = undo in every mode (build, move, rotate, scale, erase). All mappings
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

Client side the app applies an exponential smoothing filter, a deadzone,
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
3. **(0:25)** Tap B0 — the app says *"orbit"*. Point at a tower, tap B1, tilt
   to circle it. Tap B0 again, *"grab"*: hold B1 and slide it over.
4. **(0:35)** Fly to the glowing plaza. Tap B0 twice to *"build"*. Place a cube,
   tap B2, place a sphere on top, cycle to a cylinder. Switch to *"scale"* and
   grow it. Tap B3 to undo the last change.
5. **(0:50)** Hand the second glove to a teammate: a magenta cursor appears and
   they drop shapes while you keep flying. "Two people, one world, no mice."
6. **(0:55)** Click **Export STL**. "And what you built is a real file you can
   print. That's navigating and building in 3D, with your hand."
