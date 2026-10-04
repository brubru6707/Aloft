/**
 * Electronics parts from an Arduino starter kit, modelled at real size in cm (1 unit = 1 cm):
 *  - nano:   Arduino Nano board (43 × 18 mm) with chip, mini USB, reset button and two
 *            rows of 15 header pins pointing down.
 *  - led:    5 mm LED with a coloured dome, rim and two legs (the anode is longer).
 *  - button: 12 mm tactile push button with a coloured round cap and four legs.
 *
 * Each part is ONE merged BufferGeometry with per-vertex colours, so the rest of the app
 * (placing, picking, erasing, undo, saving, STL export) treats it like any other piece.
 * The geometry is centred on its bounding box, like the cube/sphere/cylinder.
 * The piece colour only paints the accent (LED dome, button cap); the rest keeps real colours.
 */
import * as THREE from 'three';

export type PartName = 'nano' | 'led' | 'button';
export const PART_NAMES: PartName[] = ['nano', 'led', 'button'];
export const isPart = (name: string): name is PartName => (PART_NAMES as string[]).includes(name);

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

function lighten(hex: string): string {
  return '#' + new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), 0.35).getHexString();
}

/** Geometry for a part. `color` paints the accent (LED dome, button cap). */
export function partGeometry(name: PartName, color: string): THREE.BufferGeometry {
  if (name === 'nano') return nano();
  if (name === 'led') return led(color);
  return button(color);
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
