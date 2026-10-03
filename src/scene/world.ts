import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

export const BUILD_AREA = { center: new THREE.Vector3(0, 0, -28), radius: 12 };

/** A deterministic PRNG so the city looks the same on every reload. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface World {
  scene: THREE.Scene;
  ground: THREE.Mesh;
  buildings: THREE.Mesh[];
  buildArea: THREE.Object3D;
}

export function createWorld(): World {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x9fb6cf, 0.0055);

  // Sky
  const sky = new Sky();
  sky.scale.setScalar(4000);
  const u = sky.material.uniforms;
  u.turbidity.value = 6; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.006; u.mieDirectionalG.value = 0.8;
  const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(55), THREE.MathUtils.degToRad(150));
  u.sunPosition.value.copy(sun);
  scene.add(sky);

  // Lights
  scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x6a6a5a, 1.1));
  const dir = new THREE.DirectionalLight(0xfff1dc, 2.2);
  dir.position.copy(sun).multiplyScalar(120);
  dir.castShadow = true;
  dir.shadow.mapSize.set(2048, 2048);
  dir.shadow.camera.near = 10; dir.shadow.camera.far = 400;
  dir.shadow.camera.left = dir.shadow.camera.bottom = -120;
  dir.shadow.camera.right = dir.shadow.camera.top = 120;
  dir.shadow.bias = -0.0005;
  scene.add(dir);

  // Ground + grid
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 600),
    new THREE.MeshStandardMaterial({ color: 0x3d4656, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.name = 'ground';
  scene.add(ground);
  const grid = new THREE.GridHelper(600, 120, 0x5b6b80, 0x3a4553);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.45;
  grid.position.y = 0.01;
  scene.add(grid);

  // City: blocks of buildings separated by roads, leaving the build plaza empty.
  const buildings: THREE.Mesh[] = [];
  const rand = mulberry32(1337);
  const blockSize = 16, road = 6, half = 4; // 9x9 blocks
  const palette = [0x8fa3bf, 0xb8c4d6, 0x6f8199, 0xd9c9a8, 0x9bb0a3, 0x7f93b0];
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x1b2028, roughness: 0.95 });
  const pitch = blockSize + road;
  for (let bx = -half; bx <= half; bx++) {
    for (let bz = -half; bz <= half; bz++) {
      const cx = bx * pitch, cz = bz * pitch;
      if (new THREE.Vector2(cx, cz).distanceTo(new THREE.Vector2(BUILD_AREA.center.x, BUILD_AREA.center.z)) < BUILD_AREA.radius + blockSize * 0.75) continue;
      if (bx === 0 && bz === 0) continue; // start plaza
      const n = 1 + Math.floor(rand() * 3);
      for (let i = 0; i < n; i++) {
        const w = 3 + rand() * 6, d = 3 + rand() * 6;
        const h = 3 + Math.pow(rand(), 1.8) * 34;
        const ox = (rand() - 0.5) * (blockSize - w), oz = (rand() - 0.5) * (blockSize - d);
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, d),
          new THREE.MeshStandardMaterial({ color: palette[Math.floor(rand() * palette.length)], roughness: 0.7, metalness: 0.05 }),
        );
        mesh.position.set(cx + ox, h / 2, cz + oz);
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.name = 'building';
        mesh.userData.selectable = true;
        scene.add(mesh);
        buildings.push(mesh);
      }
    }
  }
  // Roads
  for (let i = -half; i <= half + 1; i++) {
    const p = i * pitch - pitch / 2;
    const rx = new THREE.Mesh(new THREE.PlaneGeometry(road, (2 * half + 2) * pitch), roadMat);
    rx.rotation.x = -Math.PI / 2; rx.position.set(p, 0.02, 0); rx.receiveShadow = true; scene.add(rx);
    const rz = new THREE.Mesh(new THREE.PlaneGeometry((2 * half + 2) * pitch, road), roadMat);
    rz.rotation.x = -Math.PI / 2; rz.position.set(0, 0.02, p); rz.receiveShadow = true; scene.add(rz);
  }

  // Build area: a glowing ring on the ground.
  const buildArea = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(BUILD_AREA.radius - 0.4, BUILD_AREA.radius, 96),
    new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  const fill = new THREE.Mesh(
    new THREE.CircleGeometry(BUILD_AREA.radius - 0.4, 96),
    new THREE.MeshStandardMaterial({ color: 0x3b4252, roughness: 1 }),
  );
  fill.rotation.x = -Math.PI / 2; fill.receiveShadow = true;
  buildArea.add(fill, ring);
  buildArea.position.copy(BUILD_AREA.center).setY(0.03);
  scene.add(buildArea);

  return { scene, ground, buildings, buildArea };
}
