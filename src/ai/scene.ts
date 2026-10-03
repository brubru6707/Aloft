/**
 * Bridge between the built scene and the AI: describe the pieces as plain data, and
 * rebuild the scene from a list of piece specs (as one undoable step).
 */
import * as THREE from 'three';
import type { PrimitiveName } from '../config';
import type { AppContext } from '../modes/types';

/** One piece as the AI sees it. Sizes/positions in cm, rotation in degrees, centre position. */
export interface PieceSpec {
  shape: PrimitiveName;
  size: [number, number, number];   // width (x), height (y), depth (z) in cm
  pos: [number, number, number];    // centre, cm, y up, floor at y = 0
  rot?: [number, number, number];   // degrees about x, y, z
  color?: string;                   // #rrggbb
}

const SHAPES: PrimitiveName[] = ['cube', 'sphere', 'cylinder'];
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Current built pieces as specs (unit geometries are 2 cm, so dimensions = scale × 2). */
export function describeBuilt(ctx: AppContext): PieceSpec[] {
  return ctx.objects.built.map((m) => ({
    shape: (SHAPES.includes(m.name as PrimitiveName) ? m.name : 'cube') as PrimitiveName,
    size: [r1(m.scale.x * 2), r1(m.scale.y * 2), r1(m.scale.z * 2)],
    pos: [r1(m.position.x), r1(m.position.y), r1(m.position.z)],
    rot: [r1(THREE.MathUtils.radToDeg(m.rotation.x)), r1(THREE.MathUtils.radToDeg(m.rotation.y)), r1(THREE.MathUtils.radToDeg(m.rotation.z))],
    color: '#' + (m.material as THREE.MeshStandardMaterial).color.getHexString(),
  }));
}

/** Validate/clamp a spec coming back from the model. Returns null if unusable. */
export function sanitize(p: Partial<PieceSpec>): PieceSpec | null {
  const shape = SHAPES.includes(p.shape as PrimitiveName) ? (p.shape as PrimitiveName) : 'cube';
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const size = (Array.isArray(p.size) ? p.size : []).map((v) => Math.min(200, Math.max(0.2, num(v, 2)))) as number[];
  while (size.length < 3) size.push(size[0] ?? 2);
  const pos = (Array.isArray(p.pos) ? p.pos : [0, 0, 0]).map((v) => Math.min(400, Math.max(-400, num(v, 0)))) as number[];
  while (pos.length < 3) pos.push(0);
  const rot = (Array.isArray(p.rot) ? p.rot : [0, 0, 0]).map((v) => num(v, 0)) as number[];
  while (rot.length < 3) rot.push(0);
  if (pos[1] < size[1] / 2) pos[1] = size[1] / 2;   // never below the floor
  const color = typeof p.color === 'string' && /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : undefined;
  return { shape, size: [size[0], size[1], size[2]], pos: [pos[0], pos[1], pos[2]], rot: [rot[0], rot[1], rot[2]], color };
}

function build(spec: PieceSpec, ctx: AppContext, fallbackColor: string): THREE.Mesh {
  const mesh = ctx.objects.createPrimitive(spec.shape, spec.color ?? fallbackColor);
  mesh.scale.set(spec.size[0] / 2, spec.size[1] / 2, spec.size[2] / 2);
  mesh.position.set(spec.pos[0], spec.pos[1], spec.pos[2]);
  const r = spec.rot ?? [0, 0, 0];
  mesh.rotation.set(THREE.MathUtils.degToRad(r[0]), THREE.MathUtils.degToRad(r[1]), THREE.MathUtils.degToRad(r[2]));
  mesh.userData.halfHeight = 1;   // unscaled half height of the 2 cm unit geometry
  return mesh;
}

/**
 * Replace every built piece with the given specs, as ONE undo entry. Returns the number
 * of pieces placed.
 */
export function rebuildScene(specs: PieceSpec[], ctx: AppContext, fallbackColor: string, label: string): number {
  const old = ctx.objects.built.slice();
  const oldParents = old.map((m) => ctx.objects.remove(m).parent);
  const fresh = specs.map((s) => build(s, ctx, fallbackColor));
  fresh.forEach((m) => ctx.objects.add(m));
  ctx.undo.push({
    label,
    undo() {
      fresh.forEach((m) => ctx.objects.remove(m));
      old.forEach((m, i) => ctx.objects.restore(m, oldParents[i]));
    },
  });
  return fresh.length;
}
