import * as THREE from 'three';
import { FLY, RUNTIME, type FlyAxis, type TiltAxis } from '../config';
import { clamp, deadzone } from '../input/filter';
import { hapticFlyState } from '../ui/haptics';
import { speak } from '../ui/speak';
import type { AppContext, GloveSession, Mode } from './types';

const AXIS_VECTORS: Record<FlyAxis, THREE.Vector3> = {
  X: new THREE.Vector3(1, 0, 0),
  Y: new THREE.Vector3(0, 1, 0),
  Z: new THREE.Vector3(0, 0, 1),
};

/** Active translation axis for a glove session, or null when it is in ROTATE. */
export function flyAxis(s: GloveSession): FlyAxis | null {
  return (s.scratch.flyAxis as FlyAxis | null | undefined) ?? null;
}

/** Jump straight to a MOVE axis or ROTATE (null). Used by the tappable chips. */
export function setFlyAxis(s: GloveSession, axis: FlyAxis | null): void {
  const current = flyAxis(s);
  if (current) s.scratch.flyLastAxis = current;
  s.scratch.flyAxis = axis;
  s.scratch.flyCycleAt = performance.now();
  resetRotateAnchor(s);
  speak(axis ? axis.toLowerCase() : 'rotate');
  hapticFlyState();
}

/** Big HUD label text for the FLY state. */
export function flyLabel(s: GloveSession): string {
  const a = flyAxis(s);
  return a ? `MOVE: ${a}` : 'ROTATE';
}

/** Signed -1..1 deflection currently driving the active MOVE axis (0 in ROTATE). */
export function flyDeflection(s: GloveSession): number {
  const a = flyAxis(s);
  return a ? deflection(s, FLY.axisControl[a]) * FLY.axisSign[a] : 0;
}

/**
 * Forget the absolute-rotation anchor so the camera re-attaches to the current hand
 * angle without jumping. Call after recentering a glove or switching rotation style.
 */
export function resetRotateAnchor(s: GloveSession): void {
  delete s.scratch.rotAnchor;
}

/** Signed hand angle (degrees) for an axis, with invert flags but no deadzone (absolute style). */
function handDeg(s: GloveSession, which: TiltAxis, invert: boolean): number {
  return s.glove.tilt[which] * (invert ? -1 : 1);
}

/** Normalised -1..1 deflection of a hand axis with the FLY deadzone and tilt range applied. */
function deflection(s: GloveSession, which: TiltAxis): number {
  const max = FLY.fullTiltDeg;
  return deadzone(clamp(s.glove.tilt[which], -max, max), FLY.deadzoneDeg, max) / max;
}

/**
 * Turn / look with the hand using the current FLY.rotate style. Used by FLY's ROTATE
 * state and by any mode listed in ROTATE_IN_MODES (e.g. BUILD, ERASE), so you can keep
 * aiming the camera while placing or deleting.
 */
export function applyRotate(s: GloveSession, ctx: AppContext, dt: number): void {
  const { rig } = ctx;
  const R = FLY.rotate;
  // Glove yaw is CCW-positive like the rig's yaw, so yaw as the turn axis needs no flip;
  // roll/pitch as the turn axis keep "tilt right = turn right".
  const turnSign = (R.turnAxis === 'yaw' ? 1 : -1) * (R.invertTurn ? -1 : 1);
  const lookSign = R.invertLook ? -1 : 1;
  if (R.style === 'rate') {
    rig.yaw += deflection(s, R.turnAxis) * turnSign * THREE.MathUtils.degToRad(R.yawRateDegPerSec) * dt;
    rig.pitch += deflection(s, R.lookAxis) * lookSign * THREE.MathUtils.degToRad(R.pitchRateDegPerSec) * dt;
  } else {
    // Absolute: camera = anchor + hand angle. The anchor is captured the first frame we
    // are in this state so the camera attaches to wherever the hand is, with no jump.
    const gain = R.absoluteGain * RUNTIME.sensitivity;
    const turnRad = THREE.MathUtils.degToRad(handDeg(s, R.turnAxis, R.invertTurn) * turnSign * gain);
    const lookRad = THREE.MathUtils.degToRad(handDeg(s, R.lookAxis, R.invertLook) * gain);
    let anchor = s.scratch.rotAnchor as { yaw: number; pitch: number } | undefined;
    if (!anchor) {
      anchor = { yaw: rig.yaw - turnRad, pitch: rig.pitch - lookRad };
      s.scratch.rotAnchor = anchor;
    }
    rig.yaw = anchor.yaw + turnRad;
    rig.pitch = anchor.pitch + lookRad;
  }
  rig.apply();
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
  // Act on the press edge so the response is instant and does not depend on how long the
  // button is held. A short cooldown swallows contact bounce or a duplicated report.
  onPress(s, _ctx, button) {
    if (button !== FLY.axisCycleButton) return;
    const now = performance.now();
    const last = (s.scratch.flyCycleAt as number | undefined) ?? -Infinity;
    if (now - last < FLY.cycleCooldownMs) return;
    s.scratch.flyCycleAt = now;
    const current = flyAxis(s);
    if (current) {
      // MOVE -> ROTATE, remembering where we were in the cycle.
      s.scratch.flyLastAxis = current;
      s.scratch.flyAxis = null;
      resetRotateAnchor(s);
      speak('rotate');
    } else {
      // ROTATE -> next MOVE axis after the last one used.
      const last = s.scratch.flyLastAxis as FlyAxis | null;
      const i = last ? FLY.axisOrder.indexOf(last) : -1;
      const next = FLY.axisOrder[(i + 1) % FLY.axisOrder.length];
      s.scratch.flyAxis = next;
      speak(next.toLowerCase());
    }
    hapticFlyState();
  },
  update(s, ctx, dt) {
    const { rig } = ctx;
    const axis = flyAxis(s);
    if (axis) {
      const amount = deflection(s, FLY.axisControl[axis]);
      if (amount !== 0) rig.camera.position.addScaledVector(AXIS_VECTORS[axis], amount * FLY.axisSign[axis] * FLY.speed * dt);
    } else {
      applyRotate(s, ctx, dt);
      return;
    }
    rig.apply();
  },
};
