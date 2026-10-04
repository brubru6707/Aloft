/**
 * Device library: a narrow panel on the right edge, shown only in BUILD and ERASE, listing every
 * kit part with a small 3D thumbnail, its name and real size. Clicking a part picks it as the
 * shape (the ERASE eraser takes the same shape). Collapsible; "X2D, show me the devices" opens it.
 */
import * as THREE from 'three';
import { BUILD, type PrimitiveName } from '../config';
import { PART_LABELS, isPart, partGeometry, partSize } from '../scene/parts';

const THUMB_W = 88, THUMB_H = 64;
const thumbs = new Map<PrimitiveName, string>();

/** Render every device once to an offscreen canvas and keep the PNGs (one throwaway WebGL context). */
function renderThumbs(names: PrimitiveName[]): void {
  const todo = names.filter((n) => !thumbs.has(n) && isPart(n));
  if (!todo.length) return;
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(2);
  renderer.setSize(THUMB_W, THUMB_H, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#555555', 1.6));
  const sun = new THREE.DirectionalLight('#ffffff', 1.8);
  sun.position.set(3, 6, 4);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(30, THUMB_W / THUMB_H, 0.01, 100);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.2 });
  for (const name of todo) {
    if (!isPart(name)) continue;
    const geo = partGeometry(name, '#e87d0d');
    const mesh = new THREE.Mesh(geo, material);
    scene.add(mesh);
    // Three-quarter view from the front right, far enough to fit the bounding sphere.
    const r = geo.boundingSphere!.radius;
    const dist = r / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.92;
    camera.position.set(0.55, 0.62, 0.95).normalize().multiplyScalar(dist);
    camera.lookAt(0, 0, 0);
    camera.near = dist / 50; camera.far = dist * 4;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    thumbs.set(name, canvas.toDataURL('image/png'));
    scene.remove(mesh);
    geo.dispose();
  }
  material.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
}

/** "88 × 57 × 17 mm" from the part's size at scale 1 (cm). */
function sizeLabel(name: PrimitiveName): string {
  if (!isPart(name)) return '';
  return partSize(name).map((v) => Math.round(v * 10)).join(' × ') + ' mm';
}

export class DeviceLibrary {
  private el: HTMLElement;
  private items = new Map<PrimitiveName, HTMLElement>();
  private targetRow: HTMLElement;
  private shown = false;
  private target = 0;

  constructor(root: HTMLElement, private onPick: (gloveId: number, p: PrimitiveName) => void) {
    this.el = document.createElement('aside');
    this.el.id = 'library';
    this.el.className = 'panel';
    this.el.hidden = true;
    this.el.innerHTML = `
      <header title="Kit devices: click one to build with it (click here to fold the list)"><span>DEVICES</span><span class="target"></span><b class="fold">▾</b></header>
      <ul></ul>`;
    root.appendChild(this.el);
    this.targetRow = this.el.querySelector('.target')!;
    this.el.querySelector('header')!.onclick = (e) => {
      if ((e.target as HTMLElement).dataset.glove) return;
      this.setOpen(this.el.classList.contains('folded'));
    };
    const list = this.el.querySelector('ul')!;
    for (const name of BUILD.devices) {
      const li = document.createElement('li');
      li.title = `Build with a ${isPart(name) ? PART_LABELS[name] : name}`;
      li.innerHTML = `<span class="thumb"></span><span class="txt"><b>${isPart(name) ? PART_LABELS[name] : name}</b><small>${sizeLabel(name)}</small></span>`;
      li.onclick = () => this.onPick(this.target, name);
      list.appendChild(li);
      this.items.set(name, li);
    }
  }

  get open(): boolean { return !this.el.classList.contains('folded'); }

  /** Unfold (true) or fold (false) the list. */
  setOpen(open: boolean): void {
    this.el.classList.toggle('folded', !open);
    this.el.querySelector('.fold')!.textContent = open ? '▾' : '▸';
  }

  /**
   * Called every frame. `gloves` = the gloves currently in BUILD or ERASE (ids); the panel shows
   * only when there is at least one. With two, a G1 / G2 toggle picks whose shape a click sets.
   */
  sync(gloves: { id: number; primitive: PrimitiveName; color: string }[]): void {
    const show = gloves.length > 0;
    if (show !== this.shown) {
      this.shown = show;
      this.el.hidden = !show;
      if (show) this.fillThumbs();
    }
    if (!show) return;
    if (!gloves.some((g) => g.id === this.target)) this.target = gloves[0].id;
    const key = gloves.length > 1 ? gloves.map((g) => g.id).join(',') : '';
    if (this.targetRow.dataset.key !== key) {
      this.targetRow.dataset.key = key;
      this.targetRow.innerHTML = gloves.length > 1 ? gloves.map((g) => `<i data-glove="${g.id}" style="--glove:${g.color}">G${g.id + 1}</i>`).join('') : '';
      this.targetRow.querySelectorAll<HTMLElement>('i').forEach((el) => (el.onclick = () => { this.target = Number(el.dataset.glove); }));
    }
    this.targetRow.querySelectorAll<HTMLElement>('i').forEach((el) => el.classList.toggle('on', Number(el.dataset.glove) === this.target));
    const current = gloves.find((g) => g.id === this.target)?.primitive;
    for (const [name, li] of this.items) li.classList.toggle('on', name === current);
  }

  private fillThumbs(): void {
    // Next frame, so the panel shows at once and the thumbnails pop in right after.
    requestAnimationFrame(() => {
      try { renderThumbs(BUILD.devices); } catch { /* no WebGL for thumbnails: names only */ }
      for (const [name, li] of this.items) {
        const url = thumbs.get(name);
        const box = li.querySelector<HTMLElement>('.thumb')!;
        if (url && !box.firstChild) { const img = new Image(); img.src = url; img.alt = ''; box.appendChild(img); }
      }
    });
  }
}
