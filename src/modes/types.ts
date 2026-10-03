import * as THREE from 'three';
import type { ModeName, PrimitiveName, SizeName } from '../config';
import type { GloveInput } from '../input/GloveInput';
import type { CameraRig } from '../scene/cameraRig';
import type { ObjectRegistry } from '../scene/objects';
import type { World } from '../scene/world';
import type { UndoStack } from '../undo';

/** Shared app services available to every mode. */
export interface AppContext {
  rig: CameraRig;
  objects: ObjectRegistry;
  undo: UndoStack;
  world: World;
  toast(msg: string): void;
}

/** Per-glove state that persists across frames. */
export interface GloveSession {
  glove: GloveInput;
  color: string;
  modeIndex: number;
  /** Cursor position in normalized device coords (-1..1). Pinned to the screen centre. */
  ndc: THREE.Vector2;
  /** Selectable mesh currently under the cursor. */
  hit: THREE.Mesh | null;
  /** Ray through the cursor, updated every frame. */
  ray: THREE.Ray;
  primitive: PrimitiveName;
  /** BUILD piece size (scale factor from BUILD.sizeScale). */
  size: SizeName;
  ghost: THREE.Mesh | null;
  /** Scratch space for modes (transform sessions etc). Cleared on mode change. */
  scratch: Record<string, unknown>;
}

export interface Mode {
  readonly name: ModeName;
  enter?(s: GloveSession, ctx: AppContext): void;
  exit?(s: GloveSession, ctx: AppContext): void;
  update(s: GloveSession, ctx: AppContext, dt: number): void;
  /** Raw down edge, fired immediately on press (before tap/hold classification). */
  onPress?(s: GloveSession, ctx: AppContext, button: number): void;
  onTap?(s: GloveSession, ctx: AppContext, button: number): void;
  onHoldStart?(s: GloveSession, ctx: AppContext, button: number): void;
  onHoldEnd?(s: GloveSession, ctx: AppContext, button: number): void;
}

/** Record an object's transform so a continuous edit (move/rotate/scale) can be undone as one step. */
export interface TransformSnapshot {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
}

export function snapshot(mesh: THREE.Mesh): TransformSnapshot {
  return { mesh, position: mesh.position.clone(), quaternion: mesh.quaternion.clone(), scale: mesh.scale.clone() };
}

export function snapshotChanged(s: TransformSnapshot): boolean {
  return !s.mesh.position.equals(s.position) || !s.mesh.quaternion.equals(s.quaternion) || !s.mesh.scale.equals(s.scale);
}

/** Push an undo entry restoring the snapshot, if anything actually changed. */
export function commitTransform(s: TransformSnapshot | undefined, label: string, undo: UndoStack): void {
  if (!s || !snapshotChanged(s)) return;
  const { mesh, position, quaternion, scale } = s;
  undo.push({
    label,
    undo() { mesh.position.copy(position); mesh.quaternion.copy(quaternion); mesh.scale.copy(scale); },
  });
}
