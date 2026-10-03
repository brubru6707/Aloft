import * as THREE from 'three';
import { FLY, type FlyAxis, type TiltAxis } from '../config';
import { clamp, deadzone } from '../input/filter';
import { speak } from '../ui/speak';
import type { GloveSession, Mode } from './types';

const AXIS_VECTORS: Record<FlyAxis, THREE.Vector3> = {
  X: new THREE.Vector3(1, 0, 0),
  Y: new THREE.Vector3(0, 1, 0),
  Z: new THREE.Vector3(0, 0, 1),
};

/** Active translation axis for a glove session, or null when it is in ROTATE. */
export function flyAxis(s: GloveSession): FlyAxis | null {
  return (s.scratch.flyAxis as FlyAxis | null | undefined) ?? null;
}

/** Big HUD label text for the FLY state. */
export function flyLabel(s: GloveSession): string {
  const a = flyAxis(s);
  return a ? `MOVE: ${a}` : 'ROTATE';
}

/** Normalised -1..1 deflection of a hand axis with the FLY deadzone and tilt range applied. */
function deflection(s: GloveSession, which: TiltAxis): number {
  const max = FLY.fullTiltDeg;
  return deadzone(clamp(s.glove.tilt[which], -max, max), FLY.deadzoneDeg, max) / max;
}

/**
 * FLY. The pinky button alternates MOVE and ROTATE:
 *   MOVE: X -> ROTATE -> MOVE: Y -> ROTATE -> MOVE: Z -> ROTATE -> MOVE: X ...
 * MOVE translates along one world axis from one hand tilt; ROTATE turns/looks with the hand.
 */
export const flyMode: Mode = {
  name: 'FLY',
  enter(s) {
    if (s.scratch.flyAxis === undefined) s.scratch.flyAxis = null;      // start in ROTATE
    if (s.scratch.flyLastAxis === undefined) s.scratch.flyLastAxis = null;
  },
  onTap(s, _ctx, button) {
    if (button !== FLY.axisCycleButton) return;
    const current = flyAxis(s);
    if (current) {
      // MOVE -> ROTATE, remembering where we were in the cycle.
      s.scratch.flyLastAxis = current;
      s.scratch.flyAxis = null;
      speak('rotate');
    } else {
      // ROTATE -> next MOVE axis after the last one used.
      const last = s.scratch.flyLastAxis as FlyAxis | null;
      const i = last ? FLY.axisOrder.indexOf(last) : -1;
      const next = FLY.axisOrder[(i + 1) % FLY.axisOrder.length];
      s.scratch.flyAxis = next;
      speak(next.toLowerCase());
    }
  },
  update(s, ctx, dt) {
    const { rig } = ctx;
    const axis = flyAxis(s);
    if (axis) {
      const amount = deflection(s, FLY.axisControl[axis]);
      if (amount !== 0) rig.camera.position.addScaledVector(AXIS_VECTORS[axis], amount * FLY.axisSign[axis] * FLY.speed * dt);
    } else {
      const R = FLY.rotate;
      // Glove yaw is CCW-positive like the rig's yaw, so yaw as the turn axis needs no flip;
      // roll/pitch as the turn axis keep "tilt right = turn right".
      const turnSign = (R.turnAxis === 'yaw' ? 1 : -1) * (R.invertTurn ? -1 : 1);
      const lookSign = R.invertLook ? -1 : 1;
      rig.yaw += deflection(s, R.turnAxis) * turnSign * THREE.MathUtils.degToRad(R.yawRateDegPerSec) * dt;
      rig.pitch += deflection(s, R.lookAxis) * lookSign * THREE.MathUtils.degToRad(R.pitchRateDegPerSec) * dt;
    }
    rig.apply();
  },
};
