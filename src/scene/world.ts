import * as THREE from 'three';

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
  // Blender viewport look: flat grey background, grey fog, neutral studio-style lighting.
  scene.background = new THREE.Color(0x3d3d3d);
  scene.fog = new THREE.FogExp2(0x3d3d3d, 0.006);
  const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(50), THREE.MathUtils.degToRad(150));

  // Lights
  scene.add(new THREE.HemisphereLight(0xd0d0d0, 0x5a5a5a, 1.9));   // even, studio-like fill
  const dir = new THREE.DirectionalLight(0xffffff, 1.3);
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

  // City: blocks of buildings separated by roads, leaving the build plaza empty.
  const buildings: THREE.Mesh[] = [];
  const rand = mulberry32(1337);
  const blockSize = 16, road = 6, half = 4; // 9x9 blocks
  // Blender default-material greys, one warm and one cool for a little variety.
  const palette = [0x7f7f7f, 0x8c8c8c, 0x6e6e6e, 0x9a9a9a, 0x857f78, 0x767c85];
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.95 });
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

  return { scene, ground, buildings, buildArea };
}
