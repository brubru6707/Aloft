import * as THREE from 'three';
import type { FlyAxis } from '../config';

const AXIS_COLORS: Record<FlyAxis, number> = { X: 0xff5c7a, Y: 0x5be37e, Z: 0x4cc9f0 };
const DIRS: Record<FlyAxis, THREE.Vector3> = {
  X: new THREE.Vector3(1, 0, 0),
  Y: new THREE.Vector3(0, 1, 0),
  Z: new THREE.Vector3(0, 0, 1),
};

function labelSprite(text: string, color: number): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.font = 'bold 44px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#' + color.toString(16).padStart(6, '0');
  g.fillText(text, 32, 34);
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.setScalar(0.6);
  return sp;
}

/**
 * Small world-axes gizmo rendered in a corner. It copies the main camera's rotation so
 * the arrows always show where world X/Y/Z point on screen. The active FLY move axis is
 * drawn bright and thick, the others dimmed; in ROTATE all three are equal. The active
 * arrow also shows the current move direction: its tip glows at the end being moved toward.
 */
export class AxisGizmo {
  size = 150;      // CSS px
  margin = 18;
  top = 70;        // below the toolbar
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1.5, 1.5, 1.5, -1.5, 0.1, 10);
  private arrows: Record<FlyAxis, THREE.ArrowHelper>;
  private negTips: Record<FlyAxis, THREE.Mesh>;
  private labels: Record<FlyAxis, THREE.Sprite>;
  private quat = new THREE.Quaternion();

  constructor() {
    this.arrows = {} as Record<FlyAxis, THREE.ArrowHelper>;
    this.negTips = {} as Record<FlyAxis, THREE.Mesh>;
    this.labels = {} as Record<FlyAxis, THREE.Sprite>;
    for (const a of ['X', 'Y', 'Z'] as FlyAxis[]) {
      const arrow = new THREE.ArrowHelper(DIRS[a], new THREE.Vector3(), 1.05, AXIS_COLORS[a], 0.3, 0.18);
      this.scene.add(arrow);
      this.arrows[a] = arrow;
      // Small dot at the negative end so the axis reads as a line through the origin.
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), new THREE.MeshBasicMaterial({ color: AXIS_COLORS[a] }));
      tip.position.copy(DIRS[a]).multiplyScalar(-0.9);
      this.scene.add(tip);
      this.negTips[a] = tip;
      const label = labelSprite(a, AXIS_COLORS[a]);
      label.position.copy(DIRS[a]).multiplyScalar(1.3);
      this.scene.add(label);
      this.labels[a] = label;
    }
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffffff })));
    this.camera.position.set(0, 0, 5);
  }

  /**
   * @param mainCamera camera whose orientation the gizmo mirrors
   * @param active     FLY move axis to highlight, or null for ROTATE / other modes
   * @param deflection signed -1..1 motion along the active axis (lights the end being moved toward)
   */
  render(renderer: THREE.WebGLRenderer, mainCamera: THREE.Camera, active: FlyAxis | null, deflection: number, width: number, height: number): void {
    // Orbit the gizmo camera opposite to the main camera's rotation so world axes match the screen.
    this.quat.copy(mainCamera.quaternion);
    this.camera.position.set(0, 0, 5).applyQuaternion(this.quat);
    this.camera.quaternion.copy(this.quat);

    for (const a of ['X', 'Y', 'Z'] as FlyAxis[]) {
      const isActive = active === a;
      const dim = active !== null && !isActive;
      const op = dim ? 0.25 : 1;
      (this.arrows[a].line.material as THREE.LineBasicMaterial).opacity = op;
      (this.arrows[a].line.material as THREE.LineBasicMaterial).transparent = true;
      (this.arrows[a].cone.material as THREE.MeshBasicMaterial).opacity = op;
      (this.arrows[a].cone.material as THREE.MeshBasicMaterial).transparent = true;
      (this.negTips[a].material as THREE.MeshBasicMaterial).opacity = op;
      (this.negTips[a].material as THREE.MeshBasicMaterial).transparent = true;
      this.labels[a].material.opacity = dim ? 0.3 : 1;
      const s = isActive ? 1.35 : 1;
      this.arrows[a].scale.set(s, s, s);
      // Move direction: grow the end we are moving toward.
      const towardPos = isActive && deflection > 0.02;
      const towardNeg = isActive && deflection < -0.02;
      this.arrows[a].cone.scale.setScalar(towardPos ? 1 + Math.abs(deflection) : 1);
      this.negTips[a].scale.setScalar(towardNeg ? 1 + 2.5 * Math.abs(deflection) : 1);
    }

    const x = width - this.margin - this.size;
    const y = height - this.top - this.size;   // GL origin is bottom-left
    // Draw over the main scene (no colour clear, so no black box), with a fresh depth buffer.
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.setScissorTest(true);
    renderer.setScissor(x, y, this.size, this.size);
    renderer.setViewport(x, y, this.size, this.size);
    renderer.render(this.scene, this.camera);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, width, height);
    renderer.autoClear = autoClear;
  }
}
