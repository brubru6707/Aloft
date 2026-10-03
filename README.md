# Aloft mobile

Expo (React Native) companion app for [Aloft](../aloft): a hardware glove
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

**NAV** — the 3D view fills the screen (flat grey background and fog, ground grid,
red X and blue Z axis lines, orange build plaza ring, no buildings). Top-left: mode
name in the mode colour, a one-line hint and the FLY state (`MOVE: X` / `ROTATE`).
Top-right: a world-axes gizmo that follows the camera; in FLY the active axis is
bright and thick and the end being moved toward grows. The collapsible bottom sheet
has connection status, Connect / Simulator / Recenter / ✕, live ROLL / PITCH / YAW,
B0–B3 lamps, mode chips, ROTATE / X / Y / Z chips, the signed move-amount bar,
Rotate: rate / absolute, Undo and Export (binary STL via the share sheet).

**TEST** — mirrors the web `/test.html`: live raw and processed values, button chips
with GPIO labels (13, 25, 27, 26), Start / Stop recording, preset markers, event log,
and the generated report (stats, per-marker segments, button presses with durations,
classification events, 0.5 s trace) with Copy and Share.

## Glove controls

Tap **B0** = next mode, hold **B0** = previous mode, tap **B3** = undo. Mode order:
FLY, ORBIT, GRAB, SCALE, BUILD, ERASE. Mode and axis names are spoken and the phone
vibrates on mode / FLY-state changes.

| Mode | Controls |
| --- | --- |
| FLY | tap **B1** (pinky) alternates `ROTATE → MOVE: X → ROTATE → MOVE: Y → ROTATE → MOVE: Z → …`. MOVE translates along one world axis (X from pitch, Y and Z from roll); ROTATE turns with yaw and looks up/down with roll, in `rate` or `absolute` style |
| ORBIT | tilt orbits the selection (or the plaza); tap **B1** selects what is under the crosshair |
| GRAB | tap **B1** selects; hold **B1** + tilt moves; tilt alone rotates |
| SCALE | pitch scales the selection |
| BUILD | hand aims the camera; tap **B1** places the ghost (drops onto the surface below); tap **B2** cycles cube → sphere → cylinder |
| ERASE | hand aims; tap **B1** deletes the object under the crosshair |

## Simulator (no glove)

Tap **Simulator** in the bottom sheet. Drag one finger on the 3D view for roll / pitch
(springs back when released), drag two fingers horizontally for yaw, and hold the
on-screen **1–4** buttons for B0–B3.

## BLE protocol

The glove advertises as `Aloft-Glove` with the Nordic UART Service. The app scans
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
src/modes/               FLY, ORBIT, GRAB, SCALE, BUILD, ERASE
src/scene/               world (grid, axes, plaza), camera rig, object registry
src/app/Engine.ts        headless port of the web main.ts; one instance shared by both screens
src/ui/                  SceneView (r3f + expo-gl), AxisGizmo, HUD, BottomSheet, widgets, theme
src/screens/             MainScreen (NAV), TestScreen (TEST)
src/report.ts            test report builder; src/export.ts STL / text sharing
```
