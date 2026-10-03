import * as THREE from 'three';
import { BUILD, type PrimitiveName } from '../config';

/**
 * Registry of things the user can select, build, erase and export.
 * `built` holds user-created objects (exported to STL); city buildings are selectable too.
 */
export class ObjectRegistry {
  readonly builtGroup = new THREE.Group();
  private selectable = new Set<THREE.Mesh>();
  private hoverSaved = new Map<THREE.Mesh, number>();
  private selected: THREE.Mesh | null = null;
  private hovered: THREE.Mesh | null = null;

  constructor(private scene: THREE.Scene) {
    this.builtGroup.name = 'built';
    scene.add(this.builtGroup);
  }

  registerSelectable(mesh: THREE.Mesh): void { this.selectable.add(mesh); }
  get selectables(): THREE.Mesh[] { return [...this.selectable]; }
  get built(): THREE.Mesh[] { return this.builtGroup.children as THREE.Mesh[]; }
  get selection(): THREE.Mesh | null { return this.selected; }
  get hover(): THREE.Mesh | null { return this.hovered; }

  createPrimitive(kind: PrimitiveName, color: string): THREE.Mesh {
    let geo: THREE.BufferGeometry;
    switch (kind) {
      // Medium size = 2 cm across (1 unit = 1 cm); small/large scale by BUILD.sizeScale.
      case 'sphere': geo = new THREE.SphereGeometry(1, 32, 20); break;           // Ø 2 cm
      case 'cylinder': geo = new THREE.CylinderGeometry(1, 1, 2, 32); break;     // Ø 2 cm, 2 cm tall
      default: geo = new THREE.BoxGeometry(2, 2, 2);                             // 2 cm cube
    }
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.15 }));
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.name = kind;
    mesh.userData.built = true;
    return mesh;
  }

  add(mesh: THREE.Mesh): void {
    this.builtGroup.add(mesh);
    this.selectable.add(mesh);
  }

  /** Remove a mesh from the world (works for built objects and city buildings). */
  remove(mesh: THREE.Mesh): { parent: THREE.Object3D } {
    const parent = mesh.parent ?? this.scene;
    if (this.selected === mesh) this.select(null);
    if (this.hovered === mesh) this.setHover(null);
    parent.remove(mesh);
    this.selectable.delete(mesh);
    return { parent };
  }

  restore(mesh: THREE.Mesh, parent: THREE.Object3D): void {
    parent.add(mesh);
    this.selectable.add(mesh);
  }

  select(mesh: THREE.Mesh | null): void {
    if (this.selected && this.selected !== mesh) this.applyEmissive(this.selected, this.hovered === this.selected ? 0x333333 : 0x000000);
    this.selected = mesh;
    if (mesh) this.applyEmissive(mesh, 0x5a4a10);
  }

  setHover(mesh: THREE.Mesh | null): void {
    if (this.hovered === mesh) return;
    if (this.hovered && this.hovered !== this.selected) this.applyEmissive(this.hovered, 0x000000);
    this.hovered = mesh;
    if (mesh && mesh !== this.selected) this.applyEmissive(mesh, 0x333333);
  }

  private applyEmissive(mesh: THREE.Mesh, hex: number): void {
    const m = mesh.material as THREE.MeshStandardMaterial;
    if (!('emissive' in m)) return;
    if (!this.hoverSaved.has(mesh)) this.hoverSaved.set(mesh, m.emissive.getHex());
    m.emissive.setHex(hex);
  }

  nextPrimitive(current: PrimitiveName): PrimitiveName {
    const i = BUILD.primitives.indexOf(current);
    return BUILD.primitives[(i + 1) % BUILD.primitives.length];
  }
}
