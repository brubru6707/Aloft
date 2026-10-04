import * as THREE from 'three';
import { BUILD_AREA as AREA, RENDER, UNITS } from '../config';
import { lineText } from './lineText';

export const BUILD_AREA = { center: new THREE.Vector3(AREA.center.x, AREA.center.y, AREA.center.z), radius: AREA.radius };

export interface World {
  scene: THREE.Scene;
  ground: THREE.Mesh;
  buildArea: THREE.Object3D;
  /** Floor measurement labels; the engine turns them to face the camera every frame. */
  labels: THREE.Object3D[];
}

/**
 * Blender viewport look: flat grey background and fog, a CAD floor grid in centimetres
 * (1 unit = 1 cm) with labels every 10 cm, X/Z axis lines and the orange build plaza. No buildings.
 */
export function createWorld(): World {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(RENDER.background);
  scene.fog = new THREE.FogExp2(RENDER.background, RENDER.fogDensity);
  const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(50), THREE.MathUtils.degToRad(150));

  // Lights
  scene.add(new THREE.HemisphereLight(0xd0d0d0, 0x5a5a5a, 1.9));   // even, studio-like fill
  const dir = new THREE.DirectionalLight(0xffffff, 1.3);
  dir.position.copy(sun).multiplyScalar(120);
  dir.castShadow = RENDER.shadows;
  dir.shadow.mapSize.set(RENDER.shadowMapSize, RENDER.shadowMapSize);
  dir.shadow.camera.near = 10; dir.shadow.camera.far = 400;
  dir.shadow.camera.left = dir.shadow.camera.bottom = -120;
  dir.shadow.camera.right = dir.shadow.camera.top = 120;
  dir.shadow.bias = -0.0005;
  scene.add(dir);

  // Ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(UNITS.gridExtentCm, UNITS.gridExtentCm),
    new THREE.MeshStandardMaterial({ color: 0x393939, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.name = 'ground';
  scene.add(ground);
  // CAD-style floor: 1 cm minor lines (faint), 10 cm major lines (brighter), labels every 10 cm.
  const ext = UNITS.gridExtentCm;
  const minor = new THREE.GridHelper(ext, ext / UNITS.gridMinorCm, 0x4a4a4a, 0x4a4a4a);
  (minor.material as THREE.Material).transparent = true;
  (minor.material as THREE.Material).opacity = 0.35;
  minor.position.y = 0.01;
  scene.add(minor);
  const major = new THREE.GridHelper(ext, ext / UNITS.gridMajorCm, 0x6a6a6a, 0x6a6a6a);
  (major.material as THREE.Material).transparent = true;
  (major.material as THREE.Material).opacity = 0.8;
  major.position.y = 0.012;
  scene.add(major);
  // Measurement labels along X (red) and Z (blue) near the origin (stroke text, billboarded by the engine).
  const labels: THREE.Object3D[] = [];
  const label = (text: string, color: string, x: number, z: number) => {
    const l = lineText(text, color);
    l.position.set(x, 0.4, z);
    scene.add(l);
    labels.push(l);
  };
  for (let v = -UNITS.labelRangeCm; v <= UNITS.labelRangeCm; v += UNITS.labelEveryCm) {
    if (v === 0) continue;
    label(`${v} ${UNITS.name}`, '#ff6b7f', v, 1.4);
    label(`${-v} ${UNITS.name}`, '#6fb4ff', 1.4, v);   // -Z is "forward", shown positive
  }
  label('0', '#e6e6e6', 1.4, 1.4);
  // Blender-style axis lines through the origin: X red, Y (up) green, Z blue.
  const axisLine = (a: THREE.Vector3, b: THREE.Vector3, color: number) => {
    const g = new THREE.BufferGeometry().setFromPoints([a, b]);
    const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 });
    const l = new THREE.Line(g, m); l.position.y = 0.015; scene.add(l);
  };
  axisLine(new THREE.Vector3(-ext / 2, 0, 0), new THREE.Vector3(ext / 2, 0, 0), 0xff3352);
  axisLine(new THREE.Vector3(0, 0, -ext / 2), new THREE.Vector3(0, 0, ext / 2), 0x2890ff);
  // Y (up) in Blender green, rising from the origin like the other two.
  { const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, ext / 2, 0)]);
    scene.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x8bdc00, transparent: true, opacity: 0.85 }))); }

  // Build area: a glowing ring on the ground.
  const buildArea = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(BUILD_AREA.radius - 0.4, BUILD_AREA.radius, 96),
    new THREE.MeshBasicMaterial({ color: 0xe87d0d, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  const fill = new THREE.Mesh(
    new THREE.CircleGeometry(BUILD_AREA.radius - 0.4, 96),
    new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 1 }),
  );
  fill.rotation.x = -Math.PI / 2; fill.receiveShadow = true;
  buildArea.add(fill, ring);
  buildArea.position.copy(BUILD_AREA.center).setY(0.03);
  scene.add(buildArea);

  return { scene, ground, buildArea, labels };
}
