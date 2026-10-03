/**
 * Bridge between the built scene and the AI: describe the pieces as plain data, and
 * rebuild the scene from a list of piece specs (as one undoable step).
 */
import * as THREE from 'three';
import { BUILD, type PrimitiveName } from '../config';
import { unitSize } from '../scene/objects';
import type { AppContext } from '../modes/types';

/** One piece as the AI sees it. Sizes/positions in cm, rotation in degrees, centre position. */
export interface PieceSpec {
  shape: PrimitiveName;
  size: [number, number, number];   // width (x), height (y), depth (z) in cm
  pos: [number, number, number];    // centre, cm, y up, floor at y = 0
  rot?: [number, number, number];   // degrees about x, y, z
  color?: string;                   // #rrggbb
}

const SHAPES: readonly PrimitiveName[] = BUILD.primitives;
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Current built pieces as specs (dimensions = scale × the shape's size at scale 1). */
export function describeBuilt(ctx: AppContext): PieceSpec[] {
  return ctx.objects.built.map((m) => {
    const shape = (SHAPES.includes(m.name as PrimitiveName) ? m.name : 'cube') as PrimitiveName;
    const u = unitSize(shape);
    return {
    shape,
    size: [r1(m.scale.x * u[0]), r1(m.scale.y * u[1]), r1(m.scale.z * u[2])] as [number, number, number],
    pos: [r1(m.position.x), r1(m.position.y), r1(m.position.z)],
    rot: [r1(THREE.MathUtils.radToDeg(m.rotation.x)), r1(THREE.MathUtils.radToDeg(m.rotation.y)), r1(THREE.MathUtils.radToDeg(m.rotation.z))],
    color: typeof m.userData.color === 'string' ? m.userData.color : '#' + (m.material as THREE.MeshStandardMaterial).color.getHexString(),
    };
  });
}

/** Validate/clamp a spec coming back from the model. Returns null if unusable. */
export function sanitize(p: Partial<PieceSpec>): PieceSpec | null {
  const shape = SHAPES.includes(p.shape as PrimitiveName) ? (p.shape as PrimitiveName) : 'cube';
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const u = unitSize(shape);
  const size = (Array.isArray(p.size) ? p.size : []).map((v, i) => Math.min(200, Math.max(0.2, num(v, u[i] ?? 2)))) as number[];
  while (size.length < 3) size.push(u[size.length]);
  const pos = (Array.isArray(p.pos) ? p.pos : [0, 0, 0]).map((v) => Math.min(400, Math.max(-400, num(v, 0)))) as number[];
  while (pos.length < 3) pos.push(0);
  const rot = (Array.isArray(p.rot) ? p.rot : [0, 0, 0]).map((v) => num(v, 0)) as number[];
  while (rot.length < 3) rot.push(0);
  if (pos[1] < size[1] / 2) pos[1] = size[1] / 2;   // never below the floor
  const color = typeof p.color === 'string' && /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : undefined;
  return { shape, size: [size[0], size[1], size[2]], pos: [pos[0], pos[1], pos[2]], rot: [rot[0], rot[1], rot[2]], color };
}

/** Make a mesh from a spec (used by AI rebuilds and by opening saved projects). */
export function pieceFromSpec(spec: PieceSpec, ctx: AppContext, fallbackColor: string): THREE.Mesh {
  const mesh = ctx.objects.createPrimitive(spec.shape, spec.color ?? fallbackColor);
  const u = unitSize(spec.shape);
  mesh.scale.set(spec.size[0] / u[0], spec.size[1] / u[1], spec.size[2] / u[2]);
  mesh.position.set(spec.pos[0], spec.pos[1], spec.pos[2]);
  const r = spec.rot ?? [0, 0, 0];
  mesh.rotation.set(THREE.MathUtils.degToRad(r[0]), THREE.MathUtils.degToRad(r[1]), THREE.MathUtils.degToRad(r[2]));
  mesh.userData.halfHeight = u[1] / 2;   // unscaled half height
  return mesh;
}

/**
 * Replace every built piece with the given specs, as ONE undo entry. Returns the number
 * of pieces placed.
 */
export function rebuildScene(specs: PieceSpec[], ctx: AppContext, fallbackColor: string, label: string): number {
  const old = ctx.objects.built.slice();
  const oldParents = old.map((m) => ctx.objects.remove(m).parent);
  const fresh = specs.map((s) => pieceFromSpec(s, ctx, fallbackColor));
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
