/* Throwaway: run with `npx tsx scripts/x2d-parser-check.ts`. Checks parseControl / normalizeControl on spoken phrasings. */
import { normalizeControl, parseControl } from '../src/ai/control';

type Exp = { setting: string; value: string } | null;
const cases: [string, Exp][] = [
  // --- shapes: "give me / use / place" (settings, no Gemini) ---
  ['give me a Raspberry Pi 4', { setting: 'shape', value: 'rpi' }],
  ['can you give me a raspberry pie', { setting: 'shape', value: 'rpi' }],
  ['um give me a raspberry pi four please', { setting: 'shape', value: 'rpi' }],
  ['make my shape a servo', { setting: 'shape', value: 'servo' }],
  ['change my shape to an Arduino Nano', { setting: 'shape', value: 'nano' }],
  ['switch my shape to an arduino uno', { setting: 'shape', value: 'uno' }],
  ['use an ESP32', { setting: 'shape', value: 'esp32' }],
  ['use an esp 32 board', { setting: 'shape', value: 'esp32' }],
  ['I want an LED', { setting: 'shape', value: 'led' }],
  ['can I have a push button', { setting: 'shape', value: 'button' }],
  ['let me place a breadboard', { setting: 'shape', value: 'breadboard' }],
  ['give me a potentiometer', { setting: 'shape', value: 'pot' }],
  ['select the buzzer', { setting: 'shape', value: 'buzzer' }],
  ['use the ultrasonic sensor', { setting: 'shape', value: 'ultrasonic' }],
  ['give me a battery', { setting: 'shape', value: 'battery' }],
  ['give me a nine volt battery', { setting: 'shape', value: 'battery' }],
  ['use a resistor', { setting: 'shape', value: 'resistor' }],
  ['give me a jumper wire', { setting: 'shape', value: 'jumper' }],
  ['give me a motor', { setting: 'shape', value: 'motor' }],
  ['give me a dc motor', { setting: 'shape', value: 'motor' }],
  ['use a photoresistor', { setting: 'shape', value: 'ldr' }],
  ['give me a photo resistor', { setting: 'shape', value: 'ldr' }],
  ['use the LCD', { setting: 'shape', value: 'lcd' }],
  ['give me the lcd screen', { setting: 'shape', value: 'lcd' }],
  ['please switch to a cube', { setting: 'shape', value: 'cube' }],
  ['switch to cue', { setting: 'shape', value: 'cube' }],              // mishearing of "cube"
  ['change my cue to a sphere', { setting: 'shape', value: 'sphere' }],
  ['replace my cube with a raspberry pi', { setting: 'shape', value: 'rpi' }],
  ['replace my cube with a raspberry pi for', { setting: 'shape', value: 'rpi' }],   // "4" heard as "for"
  ['can you replace my cube with a raspberry pi 4? my build cube replacing', { setting: 'shape', value: 'rpi' }],
  ['change the shape I am on to a servo motor', { setting: 'shape', value: 'servo' }],
  ['i want to place cylinders', { setting: 'shape', value: 'cylinder' }],
  ['cylinder', { setting: 'shape', value: 'cylinder' }],
  ['sphere please', { setting: 'shape', value: 'sphere' }],
  ['let me build with an arduino nano', { setting: 'shape', value: 'nano' }],
  ['make it a cube', { setting: 'shape', value: 'cube' }],
  ['give me an arduino', { setting: 'shape', value: 'nano' }],
  ['use a servo motor', { setting: 'shape', value: 'servo' }],
  ['can you set my shape to the raspberry pi', { setting: 'shape', value: 'rpi' }],
  ['shape raspberry pi', { setting: 'shape', value: 'rpi' }],
  ['i want to use a buzzer now', { setting: 'shape', value: 'buzzer' }],
  // --- mode ---
  ['switch to build', { setting: 'mode', value: 'BUILD' }],
  ['go to fly mode', { setting: 'mode', value: 'FLY' }],
  ['erase mode', { setting: 'mode', value: 'ERASE' }],
  ['can you switch to erase please', { setting: 'mode', value: 'ERASE' }],
  ['build mode', { setting: 'mode', value: 'BUILD' }],
  ['put me in build mode', { setting: 'mode', value: 'BUILD' }],
  ['let me fly', { setting: 'mode', value: 'FLY' }],
  ['fly', { setting: 'mode', value: 'FLY' }],
  // --- size ---
  ['size large', { setting: 'size', value: 'large' }],
  ['make it small', null],   // ambiguous (shrink the build?): Gemini decides; the agent itself calls set_control size
  ['can you make the size medium', { setting: 'size', value: 'medium' }],
  ['use big pieces', { setting: 'size', value: 'large' }],
  ['switch to small', { setting: 'size', value: 'small' }],
  ['make the pieces bigger', { setting: 'size', value: 'large' }],
  ['smaller pieces please', { setting: 'size', value: 'small' }],
  // --- sensitivity ---
  ['sensitivity 0.4', { setting: 'sensitivity', value: '0.4' }],
  ['sensitivity point four', { setting: 'sensitivity', value: '0.4' }],
  ['set the sensitivity to zero point six', { setting: 'sensitivity', value: '0.6' }],
  ['sensitivity up', { setting: 'sensitivity', value: 'up' }],
  ['lower the sensitivity', { setting: 'sensitivity', value: 'down' }],
  ['sensitivity to one', { setting: 'sensitivity', value: '1' }],
  ['sensitivity half', { setting: 'sensitivity', value: '0.5' }],
  ['make it less sensitive', { setting: 'sensitivity', value: 'down' }],
  ['turn the sensitivity down', { setting: 'sensitivity', value: 'down' }],
  // --- layouts ---
  ['backup V2', { setting: 'controls', value: 'backup-v2' }],
  ['backup version two', { setting: 'controls', value: 'backup-v2' }],
  ['switch to the backup layout', { setting: 'controls', value: 'backup-v2' }],
  ['default v1', { setting: 'controls', value: 'default-v1' }],
  ['default version one controls', { setting: 'controls', value: 'default-v1' }],
  ['go back to the default v2 controls', { setting: 'controls', value: 'default-v2' }],
  ['back up v2', { setting: 'controls', value: 'backup-v2' }],
  // --- fly state / rotate style / reset ---
  ['move on y', { setting: 'fly_state', value: 'Y' }],
  ['move along the x axis', { setting: 'fly_state', value: 'X' }],
  ['rotate', { setting: 'fly_state', value: 'rotate' }],
  ['rotate absolute', { setting: 'rotate_style', value: 'absolute' }],
  ['rotation style rate', { setting: 'rotate_style', value: 'rate' }],
  ['center me', { setting: 'reset_view', value: '' }],
  ['reset the view', { setting: 'reset_view', value: '' }],
  ['take me back to the start', { setting: 'reset_view', value: '' }],
  ['recenter', { setting: 'reset_view', value: '' }],
  // --- scene requests: must stay null (go to Gemini) ---
  ['make me a stickman', null],
  ['turn the cube into a raspberry pi', null],
  ['add a cube on top of the tower', null],
  ['build me a house out of cubes', null],
  ['put an LED next to the arduino', null],
  ['replace the sphere with a cylinder', null],
  ['make the arms longer', null],
  ['can you fix it up', null],
  ['i have my cubes arranged in a grid but they look sloppy can you fix it up', null],
  ['place some LEDs right next to the arduino nano', null],
  ['stack three cubes', null],
  ['make a robot out of servos and an arduino', null],
  ['turn the cube into a raspberry pi 4', null],
  ['what is in the scene', null],
  ['how many cubes are there', null],
  ['make a circuit with a battery and an LED', null],
];

let fail = 0;
for (const [text, exp] of cases) {
  const got = parseControl(text);
  const ok = exp === null ? got === null : !!got && got.setting === exp.setting && got.value === exp.value;
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'MISS'} ${JSON.stringify(text)} -> ${JSON.stringify(got)}${ok ? '' : `  expected ${JSON.stringify(exp)}`}`);
}
console.log(`\n${cases.length - fail}/${cases.length} parseControl cases pass`);

// normalizeControl: what the agent is likely to send
const norm: [unknown, unknown, Exp | 'error'][] = [
  ['shape', 'nano', { setting: 'shape', value: 'nano' }],
  ['shape', 'Raspberry Pi 4', { setting: 'shape', value: 'rpi' }],
  ['shape', 'raspberry pie', { setting: 'shape', value: 'rpi' }],
  ['shape', 'rpi', { setting: 'shape', value: 'rpi' }],
  ['shape', 'esp32', { setting: 'shape', value: 'esp32' }],
  ['shape', 'ESP32 DevKit', { setting: 'shape', value: 'esp32' }],
  ['shape', 'Arduino Uno', { setting: 'shape', value: 'uno' }],
  ['shape', 'Arduino Nano', { setting: 'shape', value: 'nano' }],
  ['shape', 'arduino', { setting: 'shape', value: 'nano' }],
  ['shape', 'servo', { setting: 'shape', value: 'servo' }],
  ['shape', 'SG90 servo', { setting: 'shape', value: 'servo' }],
  ['shape', 'breadboard', { setting: 'shape', value: 'breadboard' }],
  ['shape', 'potentiometer', { setting: 'shape', value: 'pot' }],
  ['shape', 'pot', { setting: 'shape', value: 'pot' }],
  ['shape', 'buzzer', { setting: 'shape', value: 'buzzer' }],
  ['shape', 'ultrasonic', { setting: 'shape', value: 'ultrasonic' }],
  ['shape', 'HC-SR04', { setting: 'shape', value: 'ultrasonic' }],
  ['shape', 'battery', { setting: 'shape', value: 'battery' }],
  ['shape', '9V battery', { setting: 'shape', value: 'battery' }],
  ['shape', 'resistor', { setting: 'shape', value: 'resistor' }],
  ['shape', 'jumper', { setting: 'shape', value: 'jumper' }],
  ['shape', 'jumper wire', { setting: 'shape', value: 'jumper' }],
  ['shape', 'motor', { setting: 'shape', value: 'motor' }],
  ['shape', 'DC motor', { setting: 'shape', value: 'motor' }],
  ['shape', 'ldr', { setting: 'shape', value: 'ldr' }],
  ['shape', 'photoresistor', { setting: 'shape', value: 'ldr' }],
  ['shape', 'lcd', { setting: 'shape', value: 'lcd' }],
  ['shape', '16x2 LCD', { setting: 'shape', value: 'lcd' }],
  ['shape', 'led', { setting: 'shape', value: 'led' }],
  ['shape', 'button', { setting: 'shape', value: 'button' }],
  ['shape', 'push button', { setting: 'shape', value: 'button' }],
  ['shape', 'cube', { setting: 'shape', value: 'cube' }],
  ['shape', 'cue', { setting: 'shape', value: 'cube' }],
  ['shape', 'sphere', { setting: 'shape', value: 'sphere' }],
  ['shape', 'cylinder', { setting: 'shape', value: 'cylinder' }],
  ['shape', 'triangle', 'error'],
  ['mode', 'build', { setting: 'mode', value: 'BUILD' }],
  ['mode', 'BUILD', { setting: 'mode', value: 'BUILD' }],
  ['mode', 'fly', { setting: 'mode', value: 'FLY' }],
  ['mode', 'erase', { setting: 'mode', value: 'ERASE' }],
  ['size', 'large', { setting: 'size', value: 'large' }],
  ['size', 'big', { setting: 'size', value: 'large' }],
  ['sensitivity', '0.4', { setting: 'sensitivity', value: '0.4' }],
  ['sensitivity', 'up', { setting: 'sensitivity', value: 'up' }],
  ['sensitivity', 'lower', { setting: 'sensitivity', value: 'down' }],
  ['fly_state', 'Y', { setting: 'fly_state', value: 'Y' }],
  ['fly state', 'rotate', { setting: 'fly_state', value: 'rotate' }],
  ['rotate_style', 'absolute', { setting: 'rotate_style', value: 'absolute' }],
  ['reset_view', '', { setting: 'reset_view', value: '' }],
  ['reset_view', 'true', { setting: 'reset_view', value: '' }],
  ['controls', 'backup v2', { setting: 'controls', value: 'backup-v2' }],
  ['controls', 'Backup V2', { setting: 'controls', value: 'backup-v2' }],
  ['controls', 'default v1', { setting: 'controls', value: 'default-v1' }],
  ['controls', 'backup', { setting: 'controls', value: 'backup-v2' }],
  ['layout', 'backup v2', { setting: 'controls', value: 'backup-v2' }],
  ['shape', 'backup v2', { setting: 'controls', value: 'backup-v2' }],   // misfiled by the agent
  ['controls', 'wasd', 'error'],
  ['colour', 'red', 'error'],
];
let nfail = 0;
for (const [s, v, exp] of norm) {
  const got = normalizeControl(s, v);
  const ok = exp === 'error' ? 'error' in got : !('error' in got) && exp !== null && got.setting === exp.setting && got.value === exp.value;
  if (!ok) nfail++;
  console.log(`${ok ? 'ok  ' : 'MISS'} normalize(${JSON.stringify(s)}, ${JSON.stringify(v)}) -> ${JSON.stringify(got)}${ok ? '' : `  expected ${JSON.stringify(exp)}`}`);
}
console.log(`\n${norm.length - nfail}/${norm.length} normalizeControl cases pass`);
process.exit(fail + nfail ? 1 : 0);
