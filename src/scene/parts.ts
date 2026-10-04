/**
 * Electronics parts from an Arduino starter kit, modelled at real size in cm (1 unit = 1 cm):
 *  - nano:   Arduino Nano board (43 × 18 mm) with chip, mini USB, reset button and two
 *            rows of 15 header pins pointing down.
 *  - led:    5 mm LED with a coloured dome, rim and two legs (the anode is longer).
 *  - button: 12 mm tactile push button with a coloured round cap and four legs.
 *
 *  - rpi, esp32, uno, servo, breadboard, pot, buzzer, ultrasonic, battery, resistor, jumper,
 *    motor, ldr, lcd: the rest of the kit (Raspberry Pi 4, ESP32 DevKit, Arduino Uno, SG90
 *    servo, half-size breadboard, potentiometer, buzzer, HC-SR04, 9 V battery, resistor,
 *    jumper wire, DC motor, photoresistor, 16×2 LCD).
 *
 * Each part is ONE merged BufferGeometry with per-vertex colours, so the rest of the app
 * (placing, picking, erasing, undo, saving, STL export) treats it like any other piece.
 * The geometry is centred on its bounding box, like the cube/sphere/cylinder.
 * The piece colour only paints the accent (LED dome, button cap); the rest keeps real colours.
 */
import * as THREE from 'three';

export const PART_NAMES = ['nano', 'led', 'button', 'rpi', 'esp32', 'uno', 'servo', 'breadboard', 'pot', 'buzzer', 'ultrasonic', 'battery', 'resistor', 'jumper', 'motor', 'ldr', 'lcd'] as const;
export type PartName = (typeof PART_NAMES)[number];
/** Display name of each part (device library, toasts). */
export const PART_LABELS: Record<PartName, string> = {
  nano: 'Arduino Nano', led: 'LED (5 mm)', button: 'Push button', rpi: 'Raspberry Pi 4', esp32: 'ESP32 DevKit',
  uno: 'Arduino Uno', servo: 'SG90 servo', breadboard: 'Breadboard', pot: 'Potentiometer', buzzer: 'Buzzer',
  ultrasonic: 'HC-SR04 ultrasonic', battery: '9 V battery', resistor: 'Resistor', jumper: 'Jumper wire',
  motor: 'DC motor', ldr: 'Photoresistor (LDR)', lcd: '16×2 LCD',
};
export const isPart = (name: string): name is PartName => (PART_NAMES as readonly string[]).includes(name);

const C = {
  pcb: '#1b6fb3',      // Nano blue
  pcbEdge: '#145a92',
  chip: '#1c1c1c',
  silver: '#c9ccd1',
  gold: '#d8b04a',
  header: '#141414',
  white: '#eeeeee',
  ledLeg: '#b8bcc2',
  btnBody: '#202020',
  btnPlate: '#aeb2b8',
  smd: '#6b5a44',
  ledGreen: '#3dff6a',
  ledOrange: '#ffa53d',
  ledRed: '#ff3b30',
  piGreen: '#1f7a3a',
  unoTeal: '#0f7f9a',
  black: '#161616',
  dark: '#2a2a2a',
  servoBlue: '#2f62c8',
  breadboard: '#f1efe8',
  hole: '#3a3a36',
  railRed: '#d8343a',
  railBlue: '#2f63c8',
  copper: '#c27a3e',
  tan: '#d8c08f',
  can: '#b9bdc4',
  lcdGreen: '#9fd23a',
  lcdCell: '#86b52c',
};

/** Collects coloured, positioned pieces and merges them into one geometry. */
class Builder {
  private parts: THREE.BufferGeometry[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();

  add(geo: THREE.BufferGeometry, color: string, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0]): this {
    const g = geo.index ? geo.toNonIndexed() : geo;
    this.q.setFromEuler(this.e.set(rot[0], rot[1], rot[2]));
    this.m.compose(new THREE.Vector3(...pos), this.q, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(this.m);
    const col = new THREE.Color(color);
    const n = g.getAttribute('position').count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.parts.push(g);
    return this;
  }
  box(w: number, h: number, d: number, color: string, pos: [number, number, number], rot?: [number, number, number]): this {
    return this.add(new THREE.BoxGeometry(w, h, d), color, pos, rot);
  }
  cyl(rTop: number, rBottom: number, h: number, color: string, pos: [number, number, number], seg = 16, rot?: [number, number, number]): this {
    return this.add(new THREE.CylinderGeometry(rTop, rBottom, h, seg), color, pos, rot);
  }

  /** Flat w×d quad facing up (+Y): cheap detail such as breadboard holes or LCD cells. */
  quad(w: number, d: number, color: string, pos: [number, number, number]): this {
    return this.add(new THREE.PlaneGeometry(w, d), color, pos, [-Math.PI / 2, 0, 0]);
  }
  /** A row of n square header pins along X, centred on x0, from y down by len. */
  pins(n: number, pitch: number, x0: number, z: number, yTop: number, len: number, color = C.gold): this {
    const start = x0 - ((n - 1) * pitch) / 2;
    for (let i = 0; i < n; i++) this.box(0.064, len, 0.064, color, [start + i * pitch, yTop - len / 2, z]);
    return this;
  }

  /** Concatenate position / normal / colour, then centre on the bounding box. */
  build(): THREE.BufferGeometry {
    let total = 0;
    for (const p of this.parts) total += p.getAttribute('position').count;
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
    let o = 0;
    for (const p of this.parts) {
      const a = p.getAttribute('position'), b = p.getAttribute('normal'), c = p.getAttribute('color');
      pos.set(a.array as Float32Array, o * 3);
      nor.set(b.array as Float32Array, o * 3);
      col.set(c.array as Float32Array, o * 3);
      o += a.count;
      p.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeBoundingBox();
    const center = geo.boundingBox!.getCenter(new THREE.Vector3());
    geo.translate(-center.x, -center.y, -center.z);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return geo;
  }
}

/** Arduino Nano: long side along X (USB at -X), pins pointing down (-Y). */
function nano(): THREE.BufferGeometry {
  const L = 4.3, W = 1.8, T = 0.16;   // board
  const b = new Builder();
  b.box(L, T, W, C.pcb, [0, 0, 0]);
  b.box(L, 0.02, W, C.pcbEdge, [0, -T / 2 - 0.01, 0]);
  // Pads around the pin holes (gold), two rows of 15 at 2.54 mm pitch, rows 15.24 mm apart.
  const pitch = 0.254, rowZ = 1.524 / 2, n = 15, x0 = -((n - 1) * pitch) / 2;
  for (const z of [-rowZ, rowZ]) {
    for (let i = 0; i < n; i++) {
      const x = x0 + i * pitch;
      b.cyl(0.08, 0.08, 0.02, C.gold, [x, T / 2 + 0.01, z], 8);
      b.box(0.064, 0.6, 0.064, C.gold, [x, -T / 2 - 0.25 - 0.3, z]);   // pin below the plastic strip
    }
    b.box(n * pitch, 0.25, 0.25, C.header, [0, -T / 2 - 0.125, z]);    // black header strip
  }
  // ATmega328P (TQFP-32, 7 mm square, turned 45°) with its little legs.
  b.box(0.7, 0.1, 0.7, C.chip, [0.35, T / 2 + 0.05, 0], [0, Math.PI / 4, 0]);
  b.box(0.82, 0.02, 0.82, C.silver, [0.35, T / 2 + 0.01, 0], [0, Math.PI / 4, 0]);
  b.cyl(0.04, 0.04, 0.01, '#3a3a3a', [0.2, T / 2 + 0.105, -0.15], 8);   // pin-1 dot
  // Mini USB at the -X end, slightly overhanging.
  b.box(0.92, 0.4, 0.77, C.silver, [-L / 2 + 0.38, T / 2 + 0.2, 0]);
  b.box(0.04, 0.2, 0.5, '#2a2a2a', [-L / 2 - 0.085, T / 2 + 0.2, 0]);
  // USB-serial chip (CH340 on kit Nanos), crystal, voltage regulator.
  b.box(0.5, 0.08, 0.4, C.chip, [-0.75, T / 2 + 0.04, 0]);
  b.box(0.45, 0.13, 0.2, C.silver, [-0.1, T / 2 + 0.065, 0.55]);
  b.box(0.3, 0.1, 0.35, C.chip, [1.2, T / 2 + 0.05, -0.5]);
  // Reset button (white cap on a silver body) near the middle.
  b.box(0.42, 0.12, 0.32, C.silver, [-0.2, T / 2 + 0.06, -0.48]);
  b.cyl(0.08, 0.08, 0.08, C.white, [-0.2, T / 2 + 0.16, -0.48], 10);
  // Four status LEDs (TX, RX, power, L) and a few passives.
  const leds: [number, string][] = [[1.55, C.ledOrange], [1.7, C.ledOrange], [1.85, C.ledGreen], [2.0, C.ledOrange]];
  for (const [x, color] of leds) b.box(0.08, 0.05, 0.12, color, [x - 0.5, T / 2 + 0.025, 0.45]);
  for (const [x, z] of [[0.9, 0.5], [1.1, 0.5], [-0.5, -0.45], [1.5, -0.1], [-1.2, 0.45]] as [number, number][]) b.box(0.1, 0.05, 0.05, C.smd, [x, T / 2 + 0.025, z]);
  // ICSP header holes at the +X end (pads only).
  for (const dx of [0, 0.254]) for (const dz of [-0.254, 0, 0.254]) b.cyl(0.07, 0.07, 0.02, C.gold, [L / 2 - 0.45 + dx, T / 2 + 0.01, dz], 8);
  return b.build();
}

/** 5 mm LED standing up: coloured dome on top, legs pointing down. */
function led(color: string): THREE.BufferGeometry {
  const b = new Builder();
  const r = 0.25, body = 0.55;
  b.cyl(0.29, 0.29, 0.1, color, [0, 0.05, 0], 24);                 // rim
  b.cyl(r, r, body, color, [0, 0.1 + body / 2, 0], 24);            // body
  b.add(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), color, [0, 0.1 + body, 0]);   // dome
  b.box(0.04, 0.06, 0.12, lighten(color), [0, 0.35, 0]);           // the anvil/post inside, seen through the lens
  // Legs: anode (+) 2.8 cm, cathode (-) 2.5 cm.
  b.box(0.045, 2.8, 0.045, C.ledLeg, [0.127, -1.4, 0]);
  b.box(0.045, 2.5, 0.045, C.ledLeg, [-0.127, -1.25, 0]);
  return b.build();
}

/** 12 × 12 mm tactile push button with a round coloured cap; legs pointing down. */
function button(color: string): THREE.BufferGeometry {
  const b = new Builder();
  const s = 1.2, h = 0.36;
  b.box(s, h, s, C.btnBody, [0, h / 2, 0]);
  b.box(s, 0.03, s, C.btnPlate, [0, h + 0.015, 0]);                 // metal top plate
  for (const x of [-0.45, 0.45]) for (const z of [-0.45, 0.45]) b.cyl(0.07, 0.07, 0.04, C.btnBody, [x, h + 0.05, z], 10);   // plate rivets
  b.cyl(0.2, 0.2, 0.15, C.btnBody, [0, h + 0.1, 0], 16);            // plunger
  b.cyl(0.5, 0.5, 0.35, color, [0, h + 0.33, 0], 32);               // round cap
  b.cyl(0.42, 0.5, 0.06, lighten(color), [0, h + 0.53, 0], 32);
  // Four legs: out of the sides, then down.
  for (const x of [-0.62, 0.62]) for (const z of [-0.25, 0.25]) {
    b.box(0.06, 0.04, 0.12, C.silver, [x * 1.03, 0.08, z * 1.9]);
    b.box(0.04, 0.4, 0.12, C.silver, [x * 1.06, -0.18, z * 1.9]);
  }
  return b.build();
}

/** Raspberry Pi 4 (85 × 56 mm): GPIO header on the -Z edge, USB / Ethernet at +X, USB-C, micro HDMI and audio on +Z. */
function rpi(): THREE.BufferGeometry {
  const L = 8.5, W = 5.6, T = 0.14, top = T / 2;
  const b = new Builder();
  b.box(L, T, W, C.piGreen, [0, 0, 0]);
  // Mounting holes (3.5 mm in from the left edge, 58 × 49 mm apart).
  for (const x of [-L / 2 + 0.35, -L / 2 + 0.35 + 5.8]) for (const z of [-2.45, 2.45]) b.cyl(0.3, 0.3, 0.02, C.gold, [x, top + 0.01, z], 12);
  // 2 × 20 GPIO header: black strip and 40 pins.
  const gx = -L / 2 + 0.35 + 2.9, gz = -W / 2 + 0.35;
  b.box(5.1, 0.25, 0.51, C.header, [gx, top + 0.125, gz]);
  for (const dz of [-0.127, 0.127]) b.pins(20, 0.254, gx, gz + dz, top + 0.85, 0.6);
  // SoC under its silver heat spreader, RAM, USB controller, wifi can.
  b.box(1.5, 0.15, 1.5, C.silver, [-0.9, top + 0.075, 0.2]);
  b.box(1.0, 0.1, 1.5, C.chip, [0.7, top + 0.05, 0.2]);
  b.box(0.6, 0.08, 0.6, C.chip, [2.2, top + 0.04, 0.9]);
  b.box(1.0, 0.12, 0.8, C.silver, [-3.2, top + 0.06, -0.8]);
  // Ethernet and two double USB ports at the +X end (overhanging the edge a little).
  b.box(2.1, 1.35, 1.6, C.silver, [L / 2 - 0.85, top + 0.675, 1.85]);
  b.box(0.05, 0.8, 1.0, C.dark, [L / 2 + 0.2, top + 0.6, 1.85]);
  for (const [z, insert] of [[0, '#2a5bd7'], [-1.8, C.dark]] as [number, string][]) {
    b.box(1.75, 1.6, 1.3, C.silver, [L / 2 - 0.65, top + 0.8, z]);
    for (const y of [0.45, 1.15]) b.box(0.05, 0.22, 1.0, insert, [L / 2 + 0.24, top + y, z]);
  }
  // Bottom edge: USB-C power, two micro HDMI, audio jack; camera and display connectors.
  b.box(0.9, 0.32, 0.75, C.silver, [-L / 2 + 1.1, top + 0.16, W / 2 - 0.3]);
  for (const x of [-L / 2 + 2.6, -L / 2 + 3.95]) b.box(0.65, 0.3, 0.75, C.silver, [x, top + 0.15, W / 2 - 0.3]);
  b.box(0.6, 0.55, 1.2, C.black, [-L / 2 + 5.4, top + 0.275, W / 2 - 0.55]);
  b.box(0.25, 0.5, 2.2, C.white, [-L / 2 + 4.6, top + 0.25, 0.9]);
  b.box(2.2, 0.5, 0.25, C.white, [-L / 2 + 0.7, top + 0.25, -0.6], [0, Math.PI / 2, 0]);
  // Power and activity LEDs.
  b.box(0.1, 0.05, 0.15, C.ledRed, [-L / 2 + 0.25, top + 0.025, 1.0]);
  b.box(0.1, 0.05, 0.15, C.ledGreen, [-L / 2 + 0.25, top + 0.025, 1.3]);
  return b.build();
}

/** ESP32 DevKit (≈ 51 × 28 mm): WROOM module with its metal RF can, 2 × 19 pins down, micro USB at -X. */
function esp32(): THREE.BufferGeometry {
  const L = 5.1, W = 2.8, T = 0.16, top = T / 2;
  const b = new Builder();
  b.box(L, T, W, C.black, [0, 0, 0]);
  // Two rows of 19 pins, 25.4 mm apart, with black strips under the board.
  const rowZ = 1.27;
  for (const z of [-rowZ, rowZ]) {
    for (let i = 0; i < 19; i++) b.cyl(0.08, 0.08, 0.02, C.gold, [-((18 * 0.254) / 2) + i * 0.254, top + 0.01, z], 8);
    b.box(19 * 0.254, 0.25, 0.25, C.header, [0, -T / 2 - 0.125, z]);
    b.pins(19, 0.254, 0, z, -T / 2 - 0.25, 0.6);
  }
  // WROOM-32 module at +X: its own PCB, the RF can, the antenna strip with a gold trace.
  b.box(2.55, 0.08, 1.8, '#202020', [L / 2 - 1.2, top + 0.04, 0]);
  b.box(1.75, 0.32, 1.6, C.silver, [L / 2 - 1.6, top + 0.24, 0]);
  for (let i = 0; i < 4; i++) b.box(0.05, 0.02, 1.2, C.gold, [L / 2 - 0.55 + i * 0.12, top + 0.09, 0]);
  // Micro USB, EN and BOOT buttons, regulator, USB-serial chip, power LED.
  b.box(0.75, 0.3, 0.8, C.silver, [-L / 2 + 0.3, top + 0.15, 0]);
  for (const z of [-0.75, 0.75]) { b.box(0.45, 0.15, 0.35, C.silver, [-L / 2 + 0.5, top + 0.075, z]); b.box(0.2, 0.08, 0.15, C.dark, [-L / 2 + 0.5, top + 0.19, z]); }
  b.box(0.65, 0.16, 0.35, C.chip, [-0.9, top + 0.08, -0.45]);
  b.box(0.5, 0.08, 0.5, C.chip, [-0.6, top + 0.04, 0.45]);
  b.box(0.1, 0.05, 0.15, C.ledRed, [-1.4, top + 0.025, 0.3]);
  return b.build();
}

/** Arduino Uno (68.6 × 53.4 mm): female headers on both long edges, USB-B and barrel jack at -X, DIP ATmega328P. */
function uno(): THREE.BufferGeometry {
  const L = 6.86, W = 5.34, T = 0.16, top = T / 2;
  const b = new Builder();
  b.box(L, T, W, C.unoTeal, [0, 0, 0]);
  // Female headers: 10 + 8 on the far edge, 8 + 6 on the near edge.
  const hdr = (n: number, x: number, z: number) => {
    b.box(n * 0.254, 0.85, 0.254, C.header, [x, top + 0.425, z]);
    for (let i = 0; i < n; i++) b.quad(0.08, 0.08, '#050505', [x - ((n - 1) * 0.254) / 2 + i * 0.254, top + 0.851, z]);
  };
  hdr(10, 0.75, -W / 2 + 0.2); hdr(8, 2.95, -W / 2 + 0.2);
  hdr(8, 0.95, W / 2 - 0.2); hdr(6, 3.0, W / 2 - 0.2);
  // USB-B (silver) and DC barrel jack (black) overhanging the -X edge.
  b.box(1.6, 1.1, 1.2, C.silver, [-L / 2 + 0.6, top + 0.55, -1.0]);
  b.box(1.4, 1.1, 0.9, C.black, [-L / 2 + 0.5, top + 0.55, 1.75]);
  b.cyl(0.3, 0.3, 0.05, C.dark, [-L / 2 - 0.2, top + 0.55, 1.75], 12, [0, 0, Math.PI / 2]);
  // ATmega328P in its DIP-28 package with a row of silver legs each side.
  b.box(3.6, 0.35, 0.75, C.chip, [1.4, top + 0.33, 1.0]);
  for (const z of [0.6, 1.4]) b.box(3.5, 0.15, 0.08, C.silver, [1.4, top + 0.12, z]);
  b.box(0.6, 0.35, 0.6, C.silver, [-1.0, top + 0.175, 0.4]);   // reset button
  b.cyl(0.18, 0.18, 0.1, C.ledRed, [-1.0, top + 0.4, 0.4], 12);
  b.box(1.1, 0.35, 0.45, C.silver, [-0.9, top + 0.175, 1.5]);  // crystal
  b.box(0.7, 0.08, 0.7, C.chip, [-1.5, top + 0.04, -1.2], [0, Math.PI / 4, 0]);   // USB chip
  for (const dx of [0, 0.254]) for (const dz of [-0.254, 0, 0.254]) b.cyl(0.07, 0.07, 0.02, C.gold, [L / 2 - 0.5 + dx, top + 0.01, dz], 8);   // ICSP
  b.box(0.1, 0.05, 0.15, C.ledGreen, [0.0, top + 0.025, -1.4]);
  b.box(0.1, 0.05, 0.15, C.ledOrange, [-0.3, top + 0.025, -1.4]);
  return b.build();
}

/** SG90 micro servo: blue body with mounting tabs, output shaft and a white horn on top, wires out the side. */
function servo(): THREE.BufferGeometry {
  const b = new Builder();
  const w = 2.3, d = 1.22, h = 2.25;
  b.box(w, h, d, C.servoBlue, [0, h / 2, 0]);
  b.box(3.2, 0.25, d, C.servoBlue, [0, 1.6, 0]);                      // mounting tabs
  for (const x of [-1.38, 1.38]) b.cyl(0.11, 0.11, 0.27, '#0d0d0d', [x, 1.6, 0], 10);   // their screw holes
  b.cyl(0.6, 0.6, 0.4, C.servoBlue, [-0.55, h + 0.2, 0], 20);          // gear tower
  b.cyl(0.25, 0.25, 0.2, C.servoBlue, [0.25, h + 0.1, 0], 12);
  b.cyl(0.24, 0.24, 0.3, C.white, [-0.55, h + 0.55, 0], 12);           // output shaft
  b.box(3.2, 0.15, 0.5, C.white, [-0.55, h + 0.75, 0]);                 // two-arm horn
  b.cyl(0.4, 0.4, 0.17, C.white, [-0.55, h + 0.75, 0], 16);
  // Brown / red / orange wire stubs out of the +X side near the bottom.
  ['#5b3a1e', '#d42b2b', '#f08a1c'].forEach((c, i) => b.box(1.2, 0.1, 0.1, c, [w / 2 + 0.6, 0.35, -0.12 + i * 0.12]));
  return b.build();
}

/** Half-size breadboard (82 × 55 mm, 400 tie points): white body, red / blue power rails, holes as dark squares. */
function breadboard(): THREE.BufferGeometry {
  const L = 8.25, W = 5.5, H = 0.85, top = H / 2 + 0.002;
  const b = new Builder();
  b.box(L, H, W, C.breadboard, [0, 0, 0]);
  b.box(L - 0.4, 0.02, 0.3, '#cfccc2', [0, H / 2, 0]);                  // centre trench
  const p = 0.254, cols = 30, x0 = -((cols - 1) * p) / 2;
  // Terminal strips: 5 holes either side of the trench.
  for (const side of [-1, 1]) for (let r = 0; r < 5; r++) {
    const z = side * (0.4 + r * p);
    for (let c = 0; c < cols; c++) b.quad(0.1, 0.1, C.hole, [x0 + c * p, top, z]);
  }
  // Power rails: two rows each edge in groups of five, with a red and a blue line.
  for (const side of [-1, 1]) {
    for (const r of [0, 1]) {
      const z = side * (2.0 + r * p);
      for (let c = 0; c < 25; c++) b.quad(0.1, 0.1, C.hole, [-3.45 + c * p + Math.floor(c / 5) * 0.254, top, z]);
    }
    b.quad(L - 0.6, 0.04, C.railRed, [0, top, side * 1.78]);
    b.quad(L - 0.6, 0.04, C.railBlue, [0, top, side * 2.47]);
  }
  return b.build();
}

/** Rotary potentiometer (10 kΩ kit pot): metal body, threaded bushing, knurled shaft, three legs down. */
function pot(): THREE.BufferGeometry {
  const b = new Builder();
  b.cyl(0.8, 0.8, 0.7, C.silver, [0, 0.35, 0], 24);
  b.cyl(0.8, 0.8, 0.12, '#1d4fa0', [0, 0.06, 0], 24);                  // blue base
  b.cyl(0.35, 0.35, 0.5, C.gold, [0, 0.95, 0], 16);                    // brass bushing
  b.cyl(0.3, 0.3, 1.2, C.silver, [0, 1.8, 0], 18);                     // knurled shaft
  b.box(0.62, 0.1, 0.08, C.dark, [0, 2.38, 0]);                        // slot
  for (const x of [-0.5, 0, 0.5]) b.box(0.08, 0.6, 0.05, C.silver, [x, -0.3, 0.85]);
  b.box(1.3, 0.05, 0.3, C.silver, [0, 0.03, 0.75]);
  return b.build();
}

/** Active buzzer (12 mm): black can with a centre hole and a white "+" sticker, two legs down. */
function buzzer(): THREE.BufferGeometry {
  const b = new Builder();
  b.cyl(0.6, 0.6, 0.85, '#141414', [0, 0.425, 0], 28);
  b.cyl(0.12, 0.12, 0.02, '#050505', [0, 0.86, 0], 12);
  b.box(0.2, 0.01, 0.05, C.white, [0.35, 0.856, 0]);
  b.box(0.05, 0.01, 0.2, C.white, [0.35, 0.856, 0]);
  b.box(0.05, 1.5, 0.05, C.ledLeg, [0.38, -0.75, 0]);
  b.box(0.05, 1.3, 0.05, C.ledLeg, [-0.38, -0.65, 0]);
  return b.build();
}

/** HC-SR04 ultrasonic sensor (45 × 20 mm), standing: two transducers face +Z, four pins point down. */
function ultrasonic(): THREE.BufferGeometry {
  const b = new Builder();
  const L = 4.5, H = 2.0, T = 0.16;
  b.box(L, H, T, '#1d5fa8', [0, H / 2, 0]);
  for (const x of [-1.3, 1.3]) {
    b.cyl(0.8, 0.8, 1.2, C.can, [x, H / 2, T / 2 + 0.6], 24, [Math.PI / 2, 0, 0]);
    b.cyl(0.62, 0.62, 0.02, '#2b2b2b', [x, H / 2, T / 2 + 1.21], 24, [Math.PI / 2, 0, 0]);   // mesh
  }
  b.box(0.95, 0.4, 0.35, C.silver, [0, H - 0.35, T / 2 + 0.17]);        // crystal
  b.box(1.02, 0.25, 0.25, C.header, [0, 0.12, -0.15]);
  for (let i = 0; i < 4; i++) b.box(0.064, 0.8, 0.064, C.gold, [-0.381 + i * 0.254, -0.4, -0.15]);
  return b.build();
}

/** 9 V battery (26.5 × 48.5 × 17.5 mm) standing up, snap terminals on top. The label takes the piece colour. */
function battery(color: string): THREE.BufferGeometry {
  const b = new Builder();
  const w = 2.65, d = 1.75, h = 4.85;
  b.box(w, h * 0.72, d, color, [0, h * 0.36, 0]);
  b.box(w, h * 0.28 - 0.25, d, '#1a1a1a', [0, h * 0.72 + (h * 0.28 - 0.25) / 2, 0]);
  b.box(w * 0.92, 0.25, d * 0.9, C.silver, [0, h - 0.125, 0]);
  b.cyl(0.42, 0.42, 0.3, C.silver, [-0.6, h + 0.15, 0], 6);              // negative (hex)
  b.cyl(0.29, 0.29, 0.3, C.silver, [0.6, h + 0.15, 0], 16);              // positive (round)
  b.box(1.7, 1.4, 0.02, lighten(color), [0, h * 0.4, d / 2 + 0.01]);   // label stripe
  return b.build();
}

/** Through-hole resistor (¼ W, 220 Ω bands): beige body along X, legs bent down. */
function resistor(): THREE.BufferGeometry {
  const b = new Builder();
  const len = 0.65, r = 0.12, y = 1.0;
  b.cyl(r, r, len, C.tan, [0, y, 0], 14, [0, 0, Math.PI / 2]);
  for (const x of [-len / 2, len / 2]) b.add(new THREE.SphereGeometry(r * 1.12, 12, 8), C.tan, [x, y, 0]);
  [['#d42b2b', -0.2], ['#d42b2b', -0.1], ['#6b3a1e', 0.0], ['#d8b04a', 0.2]].forEach(([c, x]) => b.cyl(r + 0.006, r + 0.006, 0.05, c as string, [x as number, y, 0], 14, [0, 0, Math.PI / 2]));
  for (const s of [-1, 1]) {
    b.box(0.35, 0.05, 0.05, C.ledLeg, [s * (len / 2 + 0.25), y, 0]);
    b.box(0.05, y, 0.05, C.ledLeg, [s * (len / 2 + 0.42), y / 2, 0]);
  }
  return b.build();
}

/** Male-male jumper wire bent into an arch: the wire takes the piece colour, black housings with pins at both ends. */
function jumper(color: string): THREE.BufferGeometry {
  const b = new Builder();
  const span = 5, R = span / 2, legH = 1.4;
  b.add(new THREE.TorusGeometry(R, 0.08, 6, 20, Math.PI), color, [0, legH + 0.3, 0]);
  for (const x of [-R, R]) {
    b.box(0.26, legH, 0.26, C.black, [x, legH / 2 + 0.3, 0]);
    b.box(0.064, 0.6, 0.064, C.silver, [x, 0, 0]);
  }
  return b.build();
}

/** Small DC motor (type 130): silver can with flats along X, plastic end cap, two tabs and a shaft. */
function motor(): THREE.BufferGeometry {
  const b = new Builder();
  const r = 1.0, len = 2.5, y = 1.0;
  b.cyl(r, r, len, C.can, [0, y, 0], 24, [0, 0, Math.PI / 2]);
  b.box(len, 0.02, 2 * r * 0.98, C.silver, [0, y + r * 0.76, 0]);      // flats top/bottom hint
  b.cyl(r * 0.92, r * 0.92, 0.5, '#e8e2d0', [len / 2 + 0.25, y, 0], 24, [0, 0, Math.PI / 2]);   // end cap
  b.cyl(0.33, 0.33, 0.15, C.silver, [-len / 2 - 0.07, y, 0], 16, [0, 0, Math.PI / 2]);          // bearing boss
  b.cyl(0.1, 0.1, 0.9, C.silver, [-len / 2 - 0.5, y, 0], 10, [0, 0, Math.PI / 2]);              // shaft
  for (const z of [-0.45, 0.45]) b.box(0.08, 0.4, 0.2, C.copper, [len / 2 + 0.54, y + 0.55, z]);
  return b.build();
}

/** Photoresistor (5 mm LDR): orange disc with a zig-zag track under clear epoxy, two long legs. */
function ldr(): THREE.BufferGeometry {
  const b = new Builder();
  const r = 0.26;
  b.cyl(r, r, 0.22, '#c8551f', [0, 0.11, 0], 20);
  for (let i = 0; i < 5; i++) b.box(0.32, 0.01, 0.025, C.gold, [i % 2 ? 0.02 : -0.02, 0.225, -0.16 + i * 0.08]);
  b.cyl(r + 0.01, r + 0.01, 0.05, '#e0d6b8', [0, 0.245, 0], 20);
  b.box(0.045, 2.8, 0.045, C.ledLeg, [0.1, -1.4, 0]);
  b.box(0.045, 2.8, 0.045, C.ledLeg, [-0.1, -1.4, 0]);
  return b.build();
}

/** 16×2 character LCD (80 × 36 mm), display facing up: green PCB, black bezel, lit window with 2 × 16 cells, 16 pins. */
function lcd(): THREE.BufferGeometry {
  const L = 8.0, W = 3.6, T = 0.16, top = T / 2;
  const b = new Builder();
  b.box(L, T, W, C.piGreen, [0, 0, 0]);
  b.box(7.1, 0.75, 2.4, '#1c1c1c', [0, top + 0.375, 0.2]);
  b.box(6.45, 0.02, 1.6, C.lcdGreen, [0, top + 0.76, 0.2]);
  const cw = 0.295, ch = 0.5, x0 = -((16 - 1) * 0.36) / 2;
  for (const z of [-0.15, 0.55]) for (let i = 0; i < 16; i++) b.quad(cw, ch, C.lcdCell, [x0 + i * 0.36, top + 0.772, z]);
  for (const x of [-3.7, 3.7]) for (const z of [-1.5, 1.5]) b.cyl(0.15, 0.15, 0.02, C.gold, [x, top + 0.01, z], 10);
  // 16 pin header at the top-left edge, pins down.
  b.box(16 * 0.254, 0.25, 0.25, C.header, [-1.6, -T / 2 - 0.125, -W / 2 + 0.25]);
  b.pins(16, 0.254, -1.6, -W / 2 + 0.25, -T / 2 - 0.25, 0.6);
  return b.build();
}

function lighten(hex: string): string {
  return '#' + new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), 0.35).getHexString();
}

/** Geometry for a part. `color` paints the accent (LED dome, button cap, battery label, jumper wire). */
export function partGeometry(name: PartName, color: string): THREE.BufferGeometry {
  switch (name) {
    case 'nano': return nano();
    case 'led': return led(color);
    case 'button': return button(color);
    case 'rpi': return rpi();
    case 'esp32': return esp32();
    case 'uno': return uno();
    case 'servo': return servo();
    case 'breadboard': return breadboard();
    case 'pot': return pot();
    case 'buzzer': return buzzer();
    case 'ultrasonic': return ultrasonic();
    case 'battery': return battery(color);
    case 'resistor': return resistor();
    case 'jumper': return jumper(color);
    case 'motor': return motor();
    case 'ldr': return ldr();
    case 'lcd': return lcd();
  }
}

/** Real size of each part (w, h, d in cm) at scale 1, from its geometry. */
const sizeCache = new Map<PartName, [number, number, number]>();
export function partSize(name: PartName): [number, number, number] {
  let s = sizeCache.get(name);
  if (!s) {
    const g = partGeometry(name, '#ffffff');
    const v = g.boundingBox!.getSize(new THREE.Vector3());
    s = [v.x, v.y, v.z];
    g.dispose();
    sizeCache.set(name, s);
  }
  return s;
}
