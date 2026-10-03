import * as THREE from 'three';
import { BUILD, MODE_BUTTONS } from '../config';
import type { AppContext, GloveSession, Mode } from './types';

const point = new THREE.Vector3();

function halfHeight(mesh: THREE.Mesh): number {
  mesh.geometry.computeBoundingBox();
  const bb = mesh.geometry.boundingBox!;
  return (bb.max.y - bb.min.y) / 2;
}

function placementPoint(s: GloveSession, out: THREE.Vector3, hh: number): THREE.Vector3 {
  out.copy(s.ray.origin).addScaledVector(s.ray.direction, BUILD.distance);
  if (out.y < hh) out.y = hh;
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
  update(s) {
    if (!s.ghost) return;
    s.ghost.visible = s.glove.connected;
    placementPoint(s, s.ghost.position, halfHeight(s.ghost));
  },
  onTap(s, ctx, button) {
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
    mesh.position.copy(placementPoint(s, point, hh));
    mesh.rotation.y = ctx.rig.yaw;
    ctx.objects.add(mesh);
    ctx.undo.push({ label: `place ${s.primitive}`, undo: () => ctx.objects.remove(mesh) });
    ctx.toast(`Placed ${s.primitive}`);
  },
};
