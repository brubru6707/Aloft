# X2D audit — 4 Oct 2026 (before the BigRed//Hacks demo)

Branches: `x2d-audit` in `aloft-web-x2d` (web) and `aloft-mobile-x2d` (phone). Nothing pushed, nothing deployed, no agent changes published.

## Problems found

| # | Where | What happened | Status |
|---|-------|---------------|--------|
| 1 | ElevenLabs `conv_4101m431rr1de7evz2npvbc3sr5g` (web, 4:51 AM) | `set_control {setting: shape, value: nano}` → **"Tool call timed out"** after 5.0 s, then the agent said *"I have switched your shape to an Arduino Nano"* anyway. The app side takes 2–6 ms for that call (measured), so this was transport, not the app; `set_control` has `response_timeout_secs: 5` in the dashboard (the only failure in 16 calls, 3.8 % error rate). | Dashboard edits below (raise timeout, prompt: never confirm a failed tool). |
| 2 | `conv_8301m430brxmeak8tdsra0f0eacd` (web, 4:26 AM), `conv_3301m42xhe9me2fsbspmp8ra4ewe` (phone, 3:37 AM) | *"replace my Cube with a Raspberry Pi 4"* → agent chose **`build_scene`** (Failed 0 ms on web; on the phone Gemini rebuilt the whole scene into one Pi, 17 s). User then said *"not my cue, but my shape"* — ASR hears **"cube" as "cue"**. Three later `set_control` calls "succeeded" but the HUD still said *Place cube* (shape went to glove 1 while the user wore glove 2). | Parser now handles *"replace my cube with …"*, *"cue"/"queue"*; shape applies to every connected glove (aeb951f, verified in e2e); prompt edit below. |
| 3 | `conv_6901m430w2azf238j21r11f06gxj` (4:35 AM) | Same per-glove bug: `set_control shape=rpi` succeeded in 51 ms, user: *"It's still saying 'Place cube'"*. Ended with **Client disconnected unexpectedly** (page reload). | Fixed by aeb951f; verified. |
| 4 | `conv_9601m425xa6aezj8j3nnxyffrnpr` (v6, Oct 3) | *"Can you place an Arduino Nano?"* → `build_scene` → Gemini **replaced the whole scene** with one Nano; user: *"you got rid of all my stuff"*; agent never offered `undo_last`. | Parser treats *place/give me/add an X* as a shape pick (no Gemini); prompt edit: offer `undo_last`. |
| 5 | `conv_2901m4340ehffzera89xymxtabjz`, `conv_5601m430fv6re68akkzhvzb5cg48`, `conv_8401m430ve4zfwzs0kr80ntf5nqs` | First message reached the agent as a fragment (*"... for 50."*, *"to essentially"*, then client disconnected). Chrome splits the utterance after "X2D"; the 1.5 s grace already covers most of it. | Not changed; demo tip: pause after "X2D", then say the whole request in one breath. |
| 6 | Parser (`scripts/x2d-parser-check.ts`) | Misses: *"change my cue to a sphere"*, *"make the pieces bigger"*, *"smaller pieces"*, *"let me build with an Arduino Nano"*. | Fixed in `src/ai/control.ts` (both repos); 97/97 spoken phrasings + 58/58 tool payloads pass. |
| 7 | Failure modes | A hung Gemini request had no timeout; `build_scene` answered every failure with the same generic sentence; two overlapping `build_scene` calls raced each other. | Fixed: 25 s request timeout, reason-specific replies (quota / no key / timeout), "still building" guard — web `src/ai/gemini.ts`, `src/config.ts`, `src/main.ts`; phone `src/ai/gemini.ts`, `src/config.ts`, `src/core/Engine.ts`. |
| 8 | Phone Metro log | Only one real session: *"Hey X2D can…"* → session opened, `build_scene` placed a Pi (that is conv `3301…`, item 2). Otherwise just listener restarts, one *"Audio session was interrupted"* (headphones) followed by the foreground restart working. No `[x2d]` errors. | Nothing to fix. |
| 9 | Web HUD (cosmetic) | With only glove 2 connected, glove 2's mode label is drawn over glove 1's. Not hit when glove 1 is the one connected. | Not changed (out of scope for voice). |

## What was verified end to end (web, Chrome, `npx vite --port 5196`, glove Simulator, real client tools via `window.__aloft.voice.clientTools`)

- `set_control` shape nano / rpi / "Raspberry Pi 4" / "cue" / servo: 0–6 ms, HUD toast and the BUILD ghost change, **the next piece placed is that part** (checked `objects.built[].name`), a FLY glove is switched to BUILD first.
- mode, size (ghost scale 1.0 → 0.5), sensitivity 0.4, fly_state Y, rotate_style absolute, reset_view, controls "backup v2" / "default v2": all apply and read back correctly. Unknown setting / shape returns a clear "Could not change that: …" sentence.
- `show_devices` opens / closes the list and lists all 17 parts; `describe_scene`; `undo_last` ("Undid place servo" / "nothing to undo").
- Two gloves: the shape goes to every connected glove ("on both gloves"); other settings go to the glove pressed last. (One simulator at a time, so glove 1 BLE + glove 2 simulator is the real two-glove case.)
- Real `build_scene` ("stack three cubes on top of each other"): 1.3 s, 3 pieces. A second `build_scene` during it returns *Still building "…"* instead of racing.
- Gemini quota exhausted: `build_scene` replies *"The scene builder (Gemini) is out of quota right now … settings still work."*
- Mic denied while opening a session: states `connecting → off: Permission denied → listening` (toast, back to the wake word, no stuck state).
- Recent fixes: 12 s connect timeout + mic button cancel, late sessions closed (web `voice.ts`, phone `VoiceAssistant.tsx`): code-verified; foreground restart seen in the Metro log.
- Checks: web `tsc` + `vite build` pass; phone `tsc` passes.

## Not verified

- A live ElevenLabs session from this machine (no microphone in the automation), so the wake word → agent → tool loop was verified from the dashboard transcripts plus the app side, not spoken live. Say the demo phrases once on the demo laptop before judging.
- The phone fixes are typechecked only (no native rebuild, as asked); Metro will pick them up.
- Why `set_control` timed out once (item 1): not reproducible; the app answers in milliseconds.

## ElevenLabs edits to make (not published)

**Tools → set_control** (`tool_5801m41j58jpexy8fm8d1k2p5y4m`)
- Advanced → **Response timeout: 5 → 20 s** (item 1).
- Description, replace the shape clause with: *pick the piece shape — cube, sphere, cylinder, or any kit part: Arduino Nano, Arduino Uno, Raspberry Pi 4, ESP32, LED, push button, servo, breadboard, potentiometer, buzzer, ultrasonic sensor, 9 V battery, resistor, jumper wire, DC motor, photoresistor, LCD. Speech-to-text often hears "cube" as "cue" or "queue", "Raspberry Pi" as "raspberry pie", "Pi 4" as "pi for": treat those as cube / Raspberry Pi 4. "Replace / change my shape (or my cube) with X", "give me / use / let me place X", "I want to place X" all mean setting shape to X — never build_scene.*
- `value` parameter description, append: *For shape, pass the part name as said (e.g. "raspberry pi 4", "servo", "cube"). For controls pass the layout name ("backup v2").*

**Tools → build_scene** (`tool_3601m41c8ekbf1v92nn61ccc26qg`, timeout 60 s is fine)
- Description, append: *Do NOT use it to change the shape the user places with the glove (that is set_control). It replaces the whole scene with the new layout, so when the user only wants a different piece, use set_control. If the reply starts with "Still building", tell the user to wait a moment and do not call it again.*

**Agent → System prompt**, add these sentences:
- *If a tool reply says it failed, timed out, or could not change something, say so in one sentence and offer to try again. Never say a change was made unless the tool reply confirms it.*
- *If the user says their pieces disappeared or the build removed their work, call undo_last.*
- *Speech-to-text mishears: "cue" or "queue" means cube, "raspberry pie" means Raspberry Pi, "pi for" means Pi 4, "X two D" or "extudy" means X2D.*
- *"Replace my shape / my cube with X", "give me X", "let me place X", "I want to build with X" are set_control with setting shape. Only requests that change pieces already in the scene ("turn the cube into…", "add a cube on top…", "make me a stickman") go to build_scene.*
- *After set_control shape, tell the user the next piece they place will be that part.*

## Safe demo script (say "X2D", a short pause, then the phrase in one breath)

1. **"X2D"** — agent answers *Hello* (session open; the mic button also opens / closes it).
2. **"Switch to build."** — mode → BUILD on the glove you pressed last.
3. **"Give me a Raspberry Pi 4."** — shape → Raspberry Pi 4 on every connected glove; place two or three with the glove.
4. **"Change my shape to a servo."** — shape → SG90 servo; place one.
5. **"Make the pieces smaller."** — size → small; place one.
6. **"Show me the devices."** — device list opens on the right; **"Hide the devices."** closes it.
7. **"Stack three cubes on top of each other."** — Gemini build, ~1–5 s, replaces the scene with the stack (say it only when the scene can be replaced).
8. **"What's in the scene?"** — describe_scene, agent reads it back.
9. **"Undo that."** — the stack is removed.
10. **"Center me."** — camera back to the start; optionally **"Backup V2."** to show a layout switch.

Avoid on stage: *"replace my cube with…"* and *"fix my cubes / align them"* (Gemini re-layouts are unpredictable, and "replace" invites build_scene), and anything that mentions pieces already in the scene unless you want a rebuild.
