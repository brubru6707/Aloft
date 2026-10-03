import * as THREE from 'three';
import { FLY, INPUT, MODE_BUTTONS } from '../config';
import type { Mode } from './types';

const tmp = new THREE.Vector3();

export const flyMode: Mode = {
  name: 'FLY',
  update(s, ctx, dt) {
    const { rig } = ctx;
    const roll = s.glove.state.roll / INPUT.maxTiltDeg;   // -1..1
    const pitch = s.glove.state.pitch / INPUT.maxTiltDeg;

    rig.yaw -= roll * THREE.MathUtils.degToRad(FLY.yawRateDegPerSec) * dt;
    rig.pitch += pitch * THREE.MathUtils.degToRad(FLY.pitchRateDegPerSec) * dt;
    const targetBank = -roll * FLY.bankVisual;
    rig.bank += (targetBank - rig.bank) * (1 - Math.exp(-dt * 8));

    if (s.glove.isDown(MODE_BUTTONS.primary)) {
      const speed = FLY.speed * (s.glove.isDown(MODE_BUTTONS.secondary) ? FLY.boost : 1);
      rig.camera.position.addScaledVector(rig.forward(tmp), speed * dt);
    }
    rig.apply();
  },
  exit(_s, ctx) {
    ctx.rig.bank = 0;
    ctx.rig.apply();
  },
};
