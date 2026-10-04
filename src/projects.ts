/**
 * Saved projects: the built pieces, the camera and a thumbnail, kept in localStorage
 * (no backend). One entry per project plus an index of ids, newest first.
 */
import { PROJECTS } from './config';
import { describeBuilt, pieceFromSpec, type PieceSpec } from './ai/scene';
import type { AppContext } from './modes/types';

export interface ProjectCamera { pos: [number, number, number]; yaw: number; pitch: number }
export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  pieces: PieceSpec[];
  camera: ProjectCamera;
  thumbnail?: string;   // data:image/jpeg
}
/** What the dashboard lists (everything but the pieces). */
export type ProjectSummary = Omit<Project, 'pieces' | 'camera'> & { pieceCount: number };

const keyFor = (id: string) => PROJECTS.storePrefix + id;

function readIndex(): string[] {
  try { return JSON.parse(localStorage.getItem(PROJECTS.indexKey) ?? '[]') as string[]; } catch { return []; }
}
function writeIndex(ids: string[]): void { localStorage.setItem(PROJECTS.indexKey, JSON.stringify(ids)); }

export function getProject(id: string): Project | null {
  try { const raw = localStorage.getItem(keyFor(id)); return raw ? (JSON.parse(raw) as Project) : null; } catch { return null; }
}

/** All projects, most recently updated first. */
export function listProjects(): ProjectSummary[] {
  return readIndex()
    .map((id) => getProject(id))
    .filter((p): p is Project => !!p)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(({ pieces, camera: _camera, ...rest }) => ({ ...rest, pieceCount: pieces.length }));
}

/** Write a project (throws a readable error when browser storage is full). */
export function putProject(p: Project): void {
  try {
    localStorage.setItem(keyFor(p.id), JSON.stringify(p));
  } catch {
    // Storage full: retry without the thumbnail before giving up.
    if (p.thumbnail) { try { localStorage.setItem(keyFor(p.id), JSON.stringify({ ...p, thumbnail: undefined })); } catch { throw new Error('browser storage is full; delete an old project'); } }
    else throw new Error('browser storage is full; delete an old project');
  }
  const ids = readIndex().filter((x) => x !== p.id);
  writeIndex([p.id, ...ids]);
}

export function deleteProject(id: string): void {
  localStorage.removeItem(keyFor(id));
  writeIndex(readIndex().filter((x) => x !== id));
}

export function renameProject(id: string, name: string): void {
  const p = getProject(id);
  if (!p || !name.trim()) return;
  putProject({ ...p, name: name.trim(), updatedAt: Date.now() });
}

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Snapshot of the current scene as project data. */
export function captureScene(ctx: AppContext): { pieces: PieceSpec[]; camera: ProjectCamera } {
  const c = ctx.rig.camera.position;
  return { pieces: describeBuilt(ctx, true), camera: { pos: [c.x, c.y, c.z], yaw: ctx.rig.yaw, pitch: ctx.rig.pitch } };
}

/** Replace the scene with a project's pieces and camera. Clears undo history (a fresh start on this project). */
export function loadScene(ctx: AppContext, pieces: PieceSpec[], camera: ProjectCamera | null, fallbackColor: string): void {
  for (const m of ctx.objects.built.slice()) ctx.objects.remove(m);
  for (const spec of pieces) {
    ctx.objects.add(pieceFromSpec(spec, ctx, fallbackColor));
  }
  if (camera) {
    ctx.rig.camera.position.set(camera.pos[0], camera.pos[1], camera.pos[2]);
    ctx.rig.yaw = camera.yaw;
    ctx.rig.pitch = camera.pitch;
    ctx.rig.apply();
  }
  ctx.undo.clear();
}

/** Small JPEG of the canvas. Call right after rendering a frame (the WebGL buffer is cleared afterwards). */
export function thumbnailOf(canvas: HTMLCanvasElement): string | undefined {
  try {
    const w = PROJECTS.thumbWidth;
    const h = Math.round((w * canvas.height) / Math.max(1, canvas.width));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d')!.drawImage(canvas, 0, 0, w, h);
    return c.toDataURL('image/jpeg', PROJECTS.thumbQuality);
  } catch { return undefined; }
}
