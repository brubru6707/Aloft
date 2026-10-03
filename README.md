# Aloft mobile

Expo (React Native) companion app for [Aloft](../aloft) (web app in the `aloft` folder): a hardware glove
(ESP32 + MPU-6050 + four buttons) streams orientation over Bluetooth LE and the
phone turns it into a drone-style camera, an object manipulator and a primitive
builder. This is a port of the web app's logic and Blender-ish look to a phone.

## Run

BLE does not work in Expo Go, so this is a **development build** (expo-dev-client).

The project is on **Expo SDK 54**: SDK 55 needs Xcode 26.2+ and SDK 56/57 need
Xcode 26.4+, and the Mac this was built on has Xcode 26.1.1 (its Swift compiler
rejects the newer `expo-modules-jsi` sources). After updating Xcode, upgrade with
`npm install expo@latest && npx expo install --fix` and re-add the `expo-sharing` /
`expo-asset` entries to `plugins` in `app.json`.

```bash
npm install
npx expo prebuild --platform ios      # or android; generates ios/ and android/ from app.json
npx expo run:ios --device             # pick the plugged-in iPhone
npx expo run:android --device         # or the plugged-in Android phone
```

After the first install you only need the bundler: `npx expo start --dev-client`
and open the Aloft dev build on the phone.

Checks: `npx tsc --noEmit` type-checks, `npx expo-doctor` checks dependencies.

iOS signing: `ios.appleTeamId` in `app.json` picks the team. The first install
on a new phone needs Developer Mode on the phone (Settings → Privacy & Security →
Developer Mode), an Apple ID signed in to Xcode (Xcode → Settings → Accounts) so a
provisioning profile can be created, and the phone unlocked and trusting the Mac.

## Permissions

| Platform | Permission | Why |
| --- | --- | --- |
| iOS | `NSBluetoothAlwaysUsageDescription` | connect to the glove (set in `app.json` → `ios.infoPlist` and the ble-plx plugin) |
| Android 12+ | `BLUETOOTH_SCAN` (`neverForLocation`), `BLUETOOTH_CONNECT` | runtime-requested before the first scan |
| Android < 12 | `ACCESS_FINE_LOCATION` | required by the OS for BLE scanning |

## Screens

**NAV** — the 3D view fills the screen (flat grey background and fog, a CAD floor grid
in centimetres with 1 cm minor and 10 cm major lines labelled every 10 cm along X (red)
and Z (blue), red X and blue Z axis lines, orange build plaza ring, no buildings).
The world is in **centimetres** (1 unit = 1 cm). Top-left: mode
name in the mode colour, a one-line hint and the FLY state (`MOVE: X` / `ROTATE`).
Top-right: a world-axes gizmo that follows the camera; in FLY the active axis is
bright and thick and the end being moved toward grows. The collapsible bottom sheet
has connection status, Connect / Simulator / Recenter / ✕, live ROLL / PITCH / YAW,
B0–B3 lamps, mode chips (tap to jump to any mode, including the previous one), in FLY the
ROTATE / X / Y / Z chips and the signed move-amount bar, in BUILD the SHAPE
(cube / sphere / cylinder) and SIZE (S / M / L) chips with a "<edge> cm @ x, y, z cm"
readout for the ghost, Rotate: rate / absolute, ⚡ Sens (sensitivity 1× → 0.8× → 0.6× → 0.4× → 0.2× → 0×),
Undo and Export STL (binary STL via the share sheet, scaled from cm to mm for slicers).

**TEST** — mirrors the web `/test.html`: live raw and processed values, button chips
with GPIO labels (13, 25, 27, 26), Start / Stop recording, preset markers, event log,
and the generated report (stats, per-marker segments, button presses with durations,
classification events, 0.5 s trace) with Copy and Share.

## Glove controls

Press **B0** (GPIO 13) = next mode (previous mode: tap a mode chip), **B1** (GPIO 25,
pinky) = FLY MOVE/ROTATE cycle, place, delete, select, **B2** (GPIO 27) = undo, **B3**
(GPIO 26) = cycle the sensitivity multiplier 1× / 0.8× / 0.6× / 0.4× / 0.2× / 0× on every hand-driven
rate (in BUILD, B3 cycles the piece size small / medium / large instead). All act on the
press edge. Mode order: FLY, BUILD, ERASE. Mode, axis, size and sensitivity are
spoken and the phone vibrates on mode / FLY-state changes.

On connect the glove zeroes itself: the pose at the first sample becomes 0/0/0, and it
zeroes once more 1 s later when the glove's filter has settled (`INPUT.connectSettleMs`).
The sheet's ROLL / PITCH / YAW show the smoothed tilt the modes read, not the post-deadzone value.

| Mode | Controls |
| --- | --- |
| FLY | tap **B1** (pinky) alternates `ROTATE → MOVE: X → ROTATE → MOVE: Y → ROTATE → MOVE: Z → …`. MOVE: X ← roll (right = +X), Y ← pitch (up = +Y), Z ← pitch (tilt forward = forward); deadzone 2°, full speed at 25°, 20 cm/s × sensitivity. ROTATE turns with **roll** (roll right = turn right) and looks up/down with **pitch**, in `rate` or `absolute` style. Yaw is not used for control |
| BUILD | hand aims the camera; press **B1** places the ghost exactly where the crosshair points: on top of the floor or piece you aim at (stacking), or stuck to the side you aim at, at that height; never below the floor; if nothing is hit, 6 cm ahead dropped onto the surface below. **B3** or the SIZE chips cycle small / medium / large (2 cm medium cube, Ø 2 cm sphere, Ø 2 cm × 2 cm cylinder; ×0.5 / ×2); the shape comes from the SHAPE chips |
| ERASE | hand aims; tap **B1** deletes the object under the crosshair |

## Simulator (no glove)

Tap **Simulator** in the bottom sheet. Drag one finger on the 3D view for roll / pitch
(springs back when released), drag two fingers horizontally for yaw (shown on the Test
screen; not used for control), and hold the on-screen **1–4** buttons for B0–B3.

The glove firmware flips roll at the source (`SIGN_ROLL = -1`), so `INPUT.invertRoll`
and `invertPitch` stay `false` unless a direction is wrong on your glove.

## X2D voice assistant and Gemini

- **X2D** (ElevenLabs Agents): the app listens for the wake word "X2D" with the phone's
  speech recognition (expo-speech-recognition, local). Hearing it, or tapping **🎙 X2D**
  in the sheet, opens a WebRTC voice session with the public "Aloft X2D" agent
  (`@elevenlabs/react-native` on LiveKit), which answers "Hello" and then listens. Tap
  the button again to hang up. The listener pauses while a session is open and resumes
  after. The agent id and wake-word spellings are under `VOICE` in `src/config.ts`.
  Permissions: iOS `NSMicrophoneUsageDescription` + `NSSpeechRecognitionUsageDescription`,
  Android `RECORD_AUDIO`.
- **Gemini**: the **✨ ask Gemini…** box in the sheet sends a question plus a summary of
  the scene (camera, mode, every built piece with size and position in cm) to
  `gemini-3.8-flash` and shows and speaks the answer. Put your key in `.env.local` as
  `EXPO_PUBLIC_GEMINI_API_KEY=…` (copy `.env.example`; `.env.local` is git-ignored) and
  restart Metro. **A key in a client app is visible to anyone with the binary**, so use a
  key you can revoke and keep this for local use. Model, prompt and retries are under
  `GEMINI` in `src/config.ts`.

## BLE protocol

The glove still advertises as `Aloft-Glove` (firmware name) with the Nordic UART Service. The app scans
for the name prefix `Aloft` or the service UUID, subscribes to TX, reconnects
silently up to 3 times after an unexpected drop, and shows "no data" when samples
stop for 1.5 s. The protocol is unchanged from the web app.

| | UUID |
| --- | --- |
| Service | `6E400001-B5A3-F393-E0A9-E50E24DCCA9E` |
| TX (glove → phone, notify) | `6E400003-B5A3-F393-E0A9-E50E24DCCA9E` |
| RX (phone → glove, write) | `6E400002-B5A3-F393-E0A9-E50E24DCCA9E` (unused) |

Each notification carries ASCII text; lines end in `\n` and may be split or merged
across notifications, so the app buffers and splits on newline.

```
roll,pitch,yaw,buttonsBitmask\n
```

`roll`, `pitch`, `yaw` are degrees with one decimal; `buttonsBitmask` has bit *n* set
when button *n* is pressed (B0 = mode, B1 = pinky, B2, B3). 50 Hz.

Only one BLE central can hold the glove: disconnect it from Chrome on the Mac
before connecting from the phone.

## Code map

Everything tunable is in [`src/config.ts`](src/config.ts).

```
src/config.ts            all tunables (input, BLE, FLY, modes, render, UI, test bench)
src/input/               GloveInput (smoothing, recenter, deadzone, tap/hold), BleSource, TouchSimSource
src/modes/               FLY, BUILD, ERASE
src/scene/               world (cm grid + stroke-text labels, axes, plaza), camera rig, object registry
src/core/Engine.ts       headless port of the web main.ts; one instance shared by both screens
src/ui/                  SceneView (r3f + expo-gl), AxisGizmo, HUD, BottomSheet, widgets, theme
                         (Pixelify Sans only for the big labels and panel titles; system sans elsewhere)
src/screens/             MainScreen (NAV), TestScreen (TEST)
src/ui/VoiceAssistant.tsx X2D wake word + ElevenLabs session;  src/ai/gemini.ts  Gemini REST client
src/report.ts            test report builder; src/export.ts STL / text sharing
```
