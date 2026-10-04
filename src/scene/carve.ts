/**
 * ERASE carving: subtract the eraser's shape from a piece (CSG, three-bvh-csg), so a small sphere
 * eraser bites a round hole out of a big cube instead of deleting it. A piece the eraser covers
 * completely is gone. Each cut is remembered on the piece (userData.cuts, in the piece's own
 * space) so saved projects can replay it.
 */
import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';

/** One cut: the eraser's shape and its matrix relative to the piece (column-major, 16 numbers). */
export interface Cut { shape: string; m: number[] }

const evaluator = new Evaluator();
evaluator.useGroups = false;
const inv = new THREE.Matrix4();
const GREY = new THREE.Color('#5a5a5a');   // inside faces of a carved kit part

/** Copy of a geometry in world space with only the attributes the cut keeps. */
function prepared(src: THREE.BufferGeometry, world: THREE.Matrix4, withColor: boolean): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const base = src.index ? src.toNonIndexed() : src;
  g.setAttribute('position', base.getAttribute('position').clone());
  g.setAttribute('normal', (base.getAttribute('normal') ?? (base.computeVertexNormals(), base.getAttribute('normal'))).clone());
  if (withColor) {
    const c = base.getAttribute('color');
    if (c) g.setAttribute('color', c.clone());
    else {
      const n = base.getAttribute('position').count, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { a[i * 3] = GREY.r; a[i * 3 + 1] = GREY.g; a[i * 3 + 2] = GREY.b; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    }
  }
  if (base !== src) base.dispose();
  g.applyMatrix4(world);
  return g;
}

/** Does the eraser surround the whole piece? (Every corner of the piece's box inside both the
 *  cutter's box and its bounding sphere, in the cutter's own space.) */
function surrounds(piece: THREE.Mesh, cutterGeo: THREE.BufferGeometry, cutterWorld: THREE.Matrix4): boolean {
  if (!cutterGeo.boundingBox) cutterGeo.computeBoundingBox();
  if (!cutterGeo.boundingSphere) cutterGeo.computeBoundingSphere();
  if (!piece.geometry.boundingBox) piece.geometry.computeBoundingBox();
  const cb = cutterGeo.boundingBox!, cs = cutterGeo.boundingSphere!, pb = piece.geometry.boundingBox!;
  const toCutter = new THREE.Matrix4().copy(cutterWorld).invert().multiply(piece.matrixWorld);
  const v = new THREE.Vector3();
  for (const x of [pb.min.x, pb.max.x]) for (const y of [pb.min.y, pb.max.y]) for (const z of [pb.min.z, pb.max.z]) {
    v.set(x, y, z).applyMatrix4(toCutter);
    if (!cb.containsPoint(v) || !cs.containsPoint(v)) return false;
  }
  return true;
}

/**
 * Subtract `cutterGeo` (placed by `cutterWorld`) from `piece`. Returns the new geometry in the
 * piece's local space, null when nothing of the piece is left, undefined when the eraser does not
 * actually reach it. Does not modify the piece.
 */
export function subtract(piece: THREE.Mesh, cutterGeo: THREE.BufferGeometry, cutterWorld: THREE.Matrix4): THREE.BufferGeometry | null | undefined {
  piece.updateMatrixWorld(true);
  const before = piece.geometry.index ? piece.geometry.index.count : piece.geometry.getAttribute('position').count;
  const withColor = !!piece.geometry.getAttribute('color');
  evaluator.attributes = withColor ? ['position', 'normal', 'color'] : ['position', 'normal'];
  const a = new Brush(prepared(piece.geometry, piece.matrixWorld, withColor));
  const b = new Brush(prepared(cutterGeo, cutterWorld, withColor));
  a.updateMatrixWorld(); b.updateMatrixWorld();
  const result = evaluator.evaluate(a, b, SUBTRACTION);
  a.geometry.dispose(); b.geometry.dispose();
  const geo = result.geometry;
  if (!geo.getAttribute('position') || geo.getAttribute('position').count === 0) {
    geo.dispose();
    // Only delete a piece the eraser really surrounds; an empty result otherwise means the cut
    // failed, and the piece is left as it was rather than being deleted.
    if (surrounds(piece, cutterGeo, cutterWorld)) return null;
    console.warn('[carve] the cut came back empty but the eraser does not surround the piece: left unchanged');
    return undefined;
  }
  if (geo.getAttribute('position').count === before) { geo.dispose(); return undefined; }   // the eraser only grazed its box: no change
  geo.applyMatrix4(inv.copy(piece.matrixWorld).invert());   // back into the piece's own space
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/** The cut list stored on a piece. */
export function cutsOf(piece: THREE.Object3D): Cut[] { return (piece.userData.cuts as Cut[] | undefined) ?? []; }

/** A cut record for an eraser at `cutterWorld`, relative to the piece. */
export function cutFor(piece: THREE.Mesh, shape: string, cutterWorld: THREE.Matrix4): Cut {
  piece.updateMatrixWorld(true);
  const rel = new THREE.Matrix4().copy(piece.matrixWorld).invert().multiply(cutterWorld);
  return { shape, m: rel.toArray().map((v) => Math.round(v * 1e5) / 1e5) };
}

/** Re-apply saved cuts to a freshly built piece (opening a project). `geoOf` gives a shape's base geometry. */
export function replayCuts(piece: THREE.Mesh, cuts: Cut[], geoOf: (shape: string) => THREE.BufferGeometry): boolean {
  piece.updateMatrixWorld(true);
  for (const c of cuts) {
    const world = new THREE.Matrix4().copy(piece.matrixWorld).multiply(new THREE.Matrix4().fromArray(c.m));
    const g = subtract(piece, geoOf(c.shape), world);
    if (g === null) return false;   // nothing left
    if (g) piece.geometry = g;
  }
  piece.userData.cuts = cuts.slice();
  return true;
}
