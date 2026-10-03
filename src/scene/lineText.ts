import * as THREE from 'three';

/**
 * Tiny stroke font for labels in the 3D scene (there is no 2D canvas on native to rasterise
 * text into a sprite). Glyphs live in a 0.6 x 1 box, strokes as (x1,y1,x2,y2), y up.
 */
const GLYPHS: Record<string, number[][]> = {
  '0': [[0, 0, 0.6, 0], [0.6, 0, 0.6, 1], [0.6, 1, 0, 1], [0, 1, 0, 0]],
  '1': [[0.3, 0, 0.3, 1], [0.1, 0.8, 0.3, 1]],
  '2': [[0, 1, 0.6, 1], [0.6, 1, 0.6, 0.5], [0.6, 0.5, 0, 0.5], [0, 0.5, 0, 0], [0, 0, 0.6, 0]],
  '3': [[0, 1, 0.6, 1], [0.6, 1, 0.6, 0], [0.6, 0, 0, 0], [0, 0.5, 0.6, 0.5]],
  '4': [[0, 1, 0, 0.5], [0, 0.5, 0.6, 0.5], [0.6, 1, 0.6, 0]],
  '5': [[0.6, 1, 0, 1], [0, 1, 0, 0.5], [0, 0.5, 0.6, 0.5], [0.6, 0.5, 0.6, 0], [0.6, 0, 0, 0]],
  '6': [[0.6, 1, 0, 1], [0, 1, 0, 0], [0, 0, 0.6, 0], [0.6, 0, 0.6, 0.5], [0.6, 0.5, 0, 0.5]],
  '7': [[0, 1, 0.6, 1], [0.6, 1, 0.2, 0]],
  '8': [[0, 0, 0.6, 0], [0.6, 0, 0.6, 1], [0.6, 1, 0, 1], [0, 1, 0, 0], [0, 0.5, 0.6, 0.5]],
  '9': [[0.6, 0.5, 0, 0.5], [0, 0.5, 0, 1], [0, 1, 0.6, 1], [0.6, 1, 0.6, 0], [0.6, 0, 0, 0]],
  '-': [[0.1, 0.5, 0.5, 0.5]],
  'c': [[0.6, 0.6, 0, 0.6], [0, 0.6, 0, 0], [0, 0, 0.6, 0]],
  'm': [[0, 0, 0, 0.6], [0, 0.6, 0.6, 0.6], [0.6, 0.6, 0.6, 0], [0.3, 0.6, 0.3, 0]],
  ' ': [],
};
const ADVANCE = 0.8;

/** Centred line-segment text; `height` is the cap height in world units. */
export function lineText(text: string, color: THREE.ColorRepresentation, height = 0.75, opacity = 1): THREE.LineSegments {
  const pts: number[] = [];
  const width = text.length * ADVANCE - (ADVANCE - 0.6);
  let x = -width / 2;
  for (const ch of text) {
    for (const [x1, y1, x2, y2] of GLYPHS[ch] ?? []) pts.push(x + x1, y1 - 0.5, 0, x + x2, y2 - 0.5, 0);
    x += ADVANCE;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const l = new THREE.LineSegments(g, m);
  l.scale.setScalar(height);
  return l;
}
