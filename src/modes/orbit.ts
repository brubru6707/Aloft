import * as THREE from 'three';
import { INPUT, MODE_BUTTONS, ORBIT } from '../config';
import { BUILD_AREA } from '../scene/world';
import type { Mode } from './types';

const spherical = new THREE.Spherical();
const offset = new THREE.Vector3();
const target = new THREE.Vector3();

export const orbitMode: Mode = {
  name: 'ORBIT',
  update(s, ctx, dt) {
    const { rig, objects } = ctx;
    const roll = s.glove.state.roll / INPUT.maxTiltDeg;
    const pitch = s.glove.state.pitch / INPUT.maxTiltDeg;
    if (roll === 0 && pitch === 0) return;

    const sel = objects.selection;
    if (sel) target.copy(sel.position);
    else target.copy(BUILD_AREA.center).setY(2);

    offset.copy(rig.camera.position).sub(target);
    spherical.setFromVector3(offset);
    spherical.theta -= roll * THREE.MathUtils.degToRad(ORBIT.azimuthDegPerSec) * dt;
    spherical.phi -= pitch * THREE.MathUtils.degToRad(ORBIT.elevationDegPerSec) * dt;
    spherical.phi = THREE.MathUtils.clamp(spherical.phi, 0.1, Math.PI / 2 - 0.02);
    spherical.makeSafe();
    rig.camera.position.copy(target).add(offset.setFromSpherical(spherical));
    rig.lookAt(target);
  },
  onTap(s, ctx, button) {
    if (button === MODE_BUTTONS.primary && s.hit) {
      ctx.objects.select(s.hit);
      ctx.toast(`Selected ${s.hit.name}`);
    }
  },
};
