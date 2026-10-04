import * as THREE from 'three';
import { UNITS } from '../config';

export const BUILD_AREA = { center: new THREE.Vector3(0, 0, -28), radius: 12 };

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
  // Measurement labels along X (red) and Z (blue) near the origin.
  const label = (text: string, color: string) => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 48;
    const g = c.getContext('2d')!;
    g.font = 'bold 26px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = color; g.fillText(text, 64, 24);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    sp.scale.set(3.6, 1.35, 1);
    return sp;
  };
  for (let v = -UNITS.labelRangeCm; v <= UNITS.labelRangeCm; v += UNITS.labelEveryCm) {
    if (v === 0) continue;
    const lx = label(`${v} ${UNITS.name}`, '#ff6b7f'); lx.position.set(v, 0.4, 1.4); scene.add(lx);
    const lz = label(`${-v} ${UNITS.name}`, '#6fb4ff'); lz.position.set(1.4, 0.4, v); scene.add(lz);   // -Z is "forward", shown positive
  }
  const origin = label('0', '#e6e6e6'); origin.position.set(1.4, 0.4, 1.4); scene.add(origin);
  // Blender-style axis lines through the origin: X red, Y (up) green, Z blue.
  const axisLine = (a: THREE.Vector3, b: THREE.Vector3, color: number) => {
    const g = new THREE.BufferGeometry().setFromPoints([a, b]);
    const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 });
    const l = new THREE.Line(g, m); l.position.y = 0.015; scene.add(l);
  };
  axisLine(new THREE.Vector3(-300, 0, 0), new THREE.Vector3(300, 0, 0), 0xff3352);
  axisLine(new THREE.Vector3(0, 0, -300), new THREE.Vector3(0, 0, 300), 0x2890ff);
  // Y (up) in Blender green, rising from the origin like the other two.
  { const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 300, 0)]);
    scene.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x8bdc00, transparent: true, opacity: 0.85 }))); }

  // Open world: just the ground grid and the build plaza. Everything you see gets built by hand.
  const buildings: THREE.Mesh[] = [];

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
