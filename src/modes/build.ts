import * as THREE from 'three';
import { BUILD, MODE_BUTTONS } from '../config';
import type { AppContext, GloveSession, Mode } from './types';

const point = new THREE.Vector3();

function halfHeight(mesh: THREE.Mesh): number {
  mesh.geometry.computeBoundingBox();
  const bb = mesh.geometry.boundingBox!;
  return (bb.max.y - bb.min.y) / 2;
}

const down = new THREE.Vector3(0, -1, 0);
const dropRay = new THREE.Raycaster();

/**
 * Where a new object goes: BUILD.distance in front of the cursor, then dropped straight
 * down onto the first thing below it (ground, a building, or another built object) so
 * pieces land on surfaces and stack.
 */
function placementPoint(s: GloveSession, ctx: AppContext, out: THREE.Vector3, hh: number): THREE.Vector3 {
  out.copy(s.ray.origin).addScaledVector(s.ray.direction, BUILD.distance);
  dropRay.set(out, down);
  dropRay.far = BUILD.maxDropDistance;
  const targets = [ctx.world.ground, ...ctx.objects.selectables.filter((m) => m !== s.ghost)];
  const hits = dropRay.intersectObjects(targets, false);
  if (hits.length) out.y = hits[0].point.y + hh;
  else if (out.y < hh) out.y = hh;
  return out;
}

function rebuildGhost(s: GloveSession, ctx: AppContext): void {
  if (s.ghost) { s.ghost.parent?.remove(s.ghost); s.ghost = null; }
  const ghost = ctx.objects.createPrimitive(s.primitive, s.color);
  const m = ghost.material as THREE.MeshStandardMaterial;
  m.transparent = true; m.opacity = 0.35; m.depthWrite = false;
  ghost.castShadow = ghost.receiveShadow = false;
  ghost.userData.built = false;
  ghost.name = 'ghost';
  ctx.world.scene.add(ghost);
  s.ghost = ghost;
}

export const buildMode: Mode = {
  name: 'BUILD',
  enter(s, ctx) { rebuildGhost(s, ctx); },
  exit(s) {
    if (s.ghost) { s.ghost.parent?.remove(s.ghost); s.ghost = null; }
  },
  update(s, ctx) {
    if (!s.ghost) return;
    s.ghost.visible = s.glove.connected;
    placementPoint(s, ctx, s.ghost.position, halfHeight(s.ghost));
  },
  // Act on the press edge so it works no matter how long the button is held.
  onPress(s, ctx, button) {
    if (button === MODE_BUTTONS.secondary) {
      s.primitive = ctx.objects.nextPrimitive(s.primitive);
      rebuildGhost(s, ctx);
      ctx.toast(`Shape: ${s.primitive}`);
      return;
    }
    if (button !== MODE_BUTTONS.primary) return;
    const mesh = ctx.objects.createPrimitive(s.primitive, s.color);
    const hh = halfHeight(mesh);
    mesh.userData.halfHeight = hh;
    mesh.position.copy(placementPoint(s, ctx, point, hh));
    mesh.rotation.y = ctx.rig.yaw;
    ctx.objects.add(mesh);
    ctx.undo.push({ label: `place ${s.primitive}`, undo: () => ctx.objects.remove(mesh) });
    ctx.toast(`Placed ${s.primitive}`);
  },
};
