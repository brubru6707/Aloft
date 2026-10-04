import * as THREE from 'three';
import { BUILD, MODE_BUTTONS, SENSITIVITY } from '../config';
import { cycleSize, rebuildGhost } from './build';
import type { AppContext, GloveSession, Mode } from './types';

/**
 * ERASE works like BUILD: a red see-through eraser (shape from the SHAPE chips, size from
 * B2 or the SIZE chips) sits where the crosshair points, every piece it touches turns red,
 * and B1 erases them all as one undo step.
 */
const aimRay = new THREE.Raycaster();
const eraserBox = new THREE.Box3();
const pieceBox = new THREE.Box3();
const eraserSphere = new THREE.Sphere();

/** Centre the eraser on what the crosshair hits (so it overlaps it), else float ahead. */
function place(s: GloveSession, ctx: AppContext, ghost: THREE.Mesh): void {
  aimRay.set(s.ray.origin, s.ray.direction);
  aimRay.far = BUILD.maxAimDistance;
  const hit = aimRay.intersectObjects([ctx.world.ground, ...ctx.objects.built], false)[0];
  if (hit) ghost.position.copy(hit.point);
  else ghost.position.copy(s.ray.origin).addScaledVector(s.ray.direction, BUILD.distance * 2);
  ghost.updateMatrixWorld(true);
}

/** Built pieces the eraser touches (bounding-box test; a sphere eraser uses its sphere). */
function touched(ctx: AppContext, ghost: THREE.Mesh): THREE.Mesh[] {
  eraserBox.setFromObject(ghost);
  const round = ghost.name === 'sphere';
  if (round) eraserSphere.set(ghost.position, ghost.scale.x);
  return ctx.objects.built.filter((m) => {
    pieceBox.setFromObject(m);
    return round ? eraserSphere.intersectsBox(pieceBox) : eraserBox.intersectsBox(pieceBox);
  });
}

export const eraseMode: Mode = {
  name: 'ERASE',
  enter(s, ctx) { rebuildGhost(s, ctx, true); },
  exit(s, ctx) {
    if (s.ghost) { s.ghost.parent?.remove(s.ghost); s.ghost = null; }
    ctx.objects.setMarked([]);
  },
  update(s, ctx) {
    if (!s.ghost) return;
    s.ghost.visible = s.glove.connected;
    place(s, ctx, s.ghost);
    ctx.objects.setMarked(s.glove.connected ? touched(ctx, s.ghost) : []);
  },
  // Act on the press edge so it works no matter how long the button is held.
  onPress(s, ctx, button) {
    if (button === SENSITIVITY.button) return cycleSize(s, ctx);   // in ERASE, B2 is the eraser size
    if (button !== MODE_BUTTONS.primary || !s.ghost) return;
    place(s, ctx, s.ghost);
    const hits = touched(ctx, s.ghost);
    if (!hits.length) { ctx.toast('Nothing to erase here'); return; }
    ctx.objects.setMarked([]);
    const removed = hits.map((m) => ({ m, parent: ctx.objects.remove(m).parent }));
    s.hit = null;
    const label = hits.length === 1 ? `erase ${hits[0].name}` : `erase ${hits.length} pieces`;
    ctx.undo.push({ label, undo: () => removed.forEach(({ m, parent }) => ctx.objects.restore(m, parent)) });
    ctx.toast(hits.length === 1 ? `Erased ${hits[0].name}` : `Erased ${hits.length} pieces`);
  },
};
