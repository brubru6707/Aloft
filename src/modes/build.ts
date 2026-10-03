import * as THREE from 'three';
import { BUILD, MODE_BUTTONS, SENSITIVITY, type PrimitiveName, type SizeName } from '../config';
import { speak } from '../ui/speak';
import type { AppContext, GloveSession, Mode } from './types';

const point = new THREE.Vector3();

function halfHeight(mesh: THREE.Mesh): number {
  mesh.geometry.computeBoundingBox();
  const bb = mesh.geometry.boundingBox!;
  return ((bb.max.y - bb.min.y) / 2) * mesh.scale.y;
}

const down = new THREE.Vector3(0, -1, 0);
const dropRay = new THREE.Raycaster();
const aimRay = new THREE.Raycaster();
const normal = new THREE.Vector3();

/**
 * Where a new object goes: exactly where the crosshair points. The cursor ray is cast at
 * the ground and every existing piece; the new piece is centred on the hit point pushed
 * out along the hit face by its half size, so aiming at the top of a block stacks on it
 * and aiming at a side sticks the piece to that side at the aimed height (it does not
 * fall; you can build outwards from a tower). If the crosshair points at nothing, fall
 * back to BUILD.distance ahead, dropped onto the first surface below.
 */
function placementPoint(s: GloveSession, ctx: AppContext, out: THREE.Vector3, hh: number): THREE.Vector3 {
  const targets = [ctx.world.ground, ...ctx.objects.selectables.filter((m) => m !== s.ghost)];
  aimRay.set(s.ray.origin, s.ray.direction);
  aimRay.far = BUILD.maxAimDistance;
  const aim = aimRay.intersectObjects(targets, false);
  if (aim.length && aim[0].face) {
    const hit = aim[0];
    normal.copy(hit.face!.normal).transformDirection(hit.object.matrixWorld);
    out.copy(hit.point).addScaledVector(normal, hh);
    if (out.y < hh) out.y = hh;   // never below the floor
    return out;
  }
  out.copy(s.ray.origin).addScaledVector(s.ray.direction, BUILD.distance);
  dropRay.set(out, down);
  dropRay.far = BUILD.maxDropDistance;
  const hits = dropRay.intersectObjects(targets, false);
  if (hits.length) out.y = hits[0].point.y + hh;
  else if (out.y < hh) out.y = hh;
  return out;
}

function rebuildGhost(s: GloveSession, ctx: AppContext): void {
  if (s.ghost) { s.ghost.parent?.remove(s.ghost); s.ghost = null; }
  const ghost = ctx.objects.createPrimitive(s.primitive, s.color);
  ghost.scale.setScalar(BUILD.sizeScale[s.size]);
  const m = ghost.material as THREE.MeshStandardMaterial;
  m.transparent = true; m.opacity = 0.35; m.depthWrite = false;
  ghost.castShadow = ghost.receiveShadow = false;
  ghost.userData.built = false;
  ghost.name = 'ghost';
  ctx.world.scene.add(ghost);
  s.ghost = ghost;
}

/** Choose the primitive for a glove (from the panel chips); refreshes the ghost if in BUILD. */
export function setPrimitive(s: GloveSession, ctx: AppContext, p: PrimitiveName): void {
  s.primitive = p;
  if (s.ghost) rebuildGhost(s, ctx);
}

/** Choose the piece size for a glove (B2 in BUILD, or the panel chips); refreshes the ghost. */
export function setSize(s: GloveSession, ctx: AppContext, size: SizeName): void {
  s.size = size;
  if (s.ghost) rebuildGhost(s, ctx);
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
    if (button === SENSITIVITY.button) {
      // In BUILD, the sensitivity button (B3) is the size button: small -> medium -> large.
      const i = BUILD.sizes.indexOf(s.size);
      const next = BUILD.sizes[(i + 1) % BUILD.sizes.length];
      setSize(s, ctx, next);
      ctx.toast(`Size: ${next}`);
      speak(next);
      return;
    }
    if (button !== MODE_BUTTONS.primary) return;
    const mesh = ctx.objects.createPrimitive(s.primitive, s.color);
    mesh.scale.setScalar(BUILD.sizeScale[s.size]);
    const hh = halfHeight(mesh);
    mesh.userData.halfHeight = hh / mesh.scale.y;   // unscaled; SCALE mode multiplies by the live scale
    mesh.position.copy(placementPoint(s, ctx, point, hh));
    mesh.rotation.y = ctx.rig.yaw;
    ctx.objects.add(mesh);
    ctx.undo.push({ label: `place ${s.primitive}`, undo: () => ctx.objects.remove(mesh) });
    ctx.toast(`Placed ${s.primitive}`);
  },
};
