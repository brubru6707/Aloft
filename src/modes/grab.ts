import * as THREE from 'three';
import { GRAB, INPUT, MODE_BUTTONS } from '../config';
import { commitTransform, snapshot, type Mode, type TransformSnapshot } from './types';

const right = new THREE.Vector3();
const up = new THREE.Vector3();
const axis = new THREE.Vector3();
const q = new THREE.Quaternion();

/** GRAB: tap B1 selects, hold B1 + tilt drags the selection, tilt alone rotates it. */
export const grabMode: Mode = {
  name: 'GRAB',
  update(s, ctx, dt) {
    const sel = ctx.objects.selection;
    if (!sel) return;
    const roll = s.glove.state.roll / INPUT.maxTiltDeg;
    const pitch = s.glove.state.pitch / INPUT.maxTiltDeg;
    const active = roll !== 0 || pitch !== 0;

    if (s.glove.isDown(MODE_BUTTONS.primary)) {
      // Translate: tilt = velocity in camera space.
      if (!s.scratch.move) s.scratch.move = snapshot(sel);
      s.scratch.rotateArmed = false; // hand must return to level before tilt rotates again
      const k = GRAB.moveUnitsPerDeg * INPUT.maxTiltDeg; // units/sec at full tilt
      ctx.rig.right(right); right.y = 0; right.normalize();
      up.set(0, 1, 0);
      sel.position.addScaledVector(right, roll * k * dt);
      sel.position.addScaledVector(up, pitch * k * dt);
      return;
    }

    // Rotate when not holding the grab button. Only after the hand has been level once
    // since the last grab, so letting go of the button mid-tilt does not spin the object.
    if (!active) s.scratch.rotateArmed = true;
    if (active && s.scratch.rotateArmed) {
      if (!s.scratch.rotate) s.scratch.rotate = snapshot(sel);
      q.setFromAxisAngle(axis.set(0, 1, 0), -roll * GRAB.rotateRadPerSecAtFull * dt);
      sel.quaternion.premultiply(q);
      ctx.rig.right(right); right.y = 0; right.normalize();
      q.setFromAxisAngle(right, -pitch * GRAB.rotateRadPerSecAtFull * dt);
      sel.quaternion.premultiply(q);
    } else if (s.scratch.rotate) {
      commitTransform(s.scratch.rotate as TransformSnapshot, 'rotate', ctx.undo);
      delete s.scratch.rotate;
    }
  },
  onTap(s, ctx, button) {
    if (button === MODE_BUTTONS.primary && s.hit) {
      ctx.objects.select(s.hit);
      ctx.toast(`Grabbed ${s.hit.name}`);
    }
  },
  onHoldEnd(s, ctx, button) {
    if (button === MODE_BUTTONS.primary && s.scratch.move) {
      commitTransform(s.scratch.move as TransformSnapshot, 'move', ctx.undo);
      delete s.scratch.move;
    }
  },
  exit(s, ctx) {
    commitTransform(s.scratch.move as TransformSnapshot | undefined, 'move', ctx.undo);
    commitTransform(s.scratch.rotate as TransformSnapshot | undefined, 'rotate', ctx.undo);
    delete s.scratch.move; delete s.scratch.rotate;
  },
};
