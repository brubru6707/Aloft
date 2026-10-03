import * as THREE from 'three';
import { BUILD_AREA as AREA, RENDER } from '../config';

export const BUILD_AREA = { center: new THREE.Vector3(AREA.center.x, AREA.center.y, AREA.center.z), radius: AREA.radius };

export interface World {
  scene: THREE.Scene;
  ground: THREE.Mesh;
  buildArea: THREE.Object3D;
}

/** Blender viewport look: flat grey background and fog, grey ground grid, X/Z axis lines, orange build plaza. No buildings. */
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

  // Ground + grid
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 600),
    new THREE.MeshStandardMaterial({ color: 0x393939, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.name = 'ground';
  scene.add(ground);
  const grid = new THREE.GridHelper(600, 120, 0x545454, 0x4a4a4a);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.7;
  grid.position.y = 0.01;
  scene.add(grid);
  // Blender-style axis lines through the origin: X red, Z blue (Y is up here).
  const axisLine = (a: THREE.Vector3, b: THREE.Vector3, color: number) => {
    const g = new THREE.BufferGeometry().setFromPoints([a, b]);
    const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 });
    const l = new THREE.Line(g, m); l.position.y = 0.015; scene.add(l);
  };
  axisLine(new THREE.Vector3(-300, 0, 0), new THREE.Vector3(300, 0, 0), 0xff3352);
  axisLine(new THREE.Vector3(0, 0, -300), new THREE.Vector3(0, 0, 300), 0x2890ff);

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

  return { scene, ground, buildArea };
}
