import * as THREE from 'three';
import { CAMERA, FLY } from '../config';

/** Camera with explicit yaw/pitch/bank so modes can drive it in degrees. */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  yaw = 0;    // radians, around Y
  pitch = 0;  // radians, around X (positive = look up)
  bank = 0;   // radians, visual roll
  private euler = new THREE.Euler(0, 0, 0, 'YXZ');

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, aspect, CAMERA.near, CAMERA.far);
    this.reset();
  }

  /** Back to the start pose. */
  reset(): void {
    this.camera.position.set(CAMERA.start.x, CAMERA.start.y, CAMERA.start.z);
    this.yaw = 0;
    this.pitch = CAMERA.startPitch;
    this.bank = 0;
    this.apply();
  }

  apply(): void {
    this.pitch = THREE.MathUtils.clamp(this.pitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
    this.euler.set(this.pitch, this.yaw, this.bank);
    this.camera.quaternion.setFromEuler(this.euler);
    if (this.camera.position.y < FLY.minHeight) this.camera.position.y = FLY.minHeight;
  }

  forward(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
  }
  right(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
  }
  up(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
  }

  /** Point the camera at a target from its current position (used after orbiting). */
  lookAt(target: THREE.Vector3): void {
    const d = target.clone().sub(this.camera.position);
    this.yaw = Math.atan2(-d.x, -d.z);
    this.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    this.apply();
  }
}
