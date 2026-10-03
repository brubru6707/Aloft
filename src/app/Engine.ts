import * as THREE from 'three';
import { BLE, FLY, GLOBAL_ACTIONS, GLOVE_COLOR, GLOVE_DEFAULT_MODE, MODE_COLORS, MODE_HINTS, MODE_ORDER, RENDER, ROTATE_IN_MODES, UI, type FlyAxis, type ModeName, type PrimitiveName, type RotateStyle } from '../config';
import { BleSource } from '../input/BleSource';
import { GloveInput } from '../input/GloveInput';
import { TouchSimSource } from '../input/TouchSimSource';
import type { SourceKind, SourceStatus } from '../input/types';
import { MODES, modeIndexOf, type AppContext, type GloveSession } from '../modes';
import { applyRotate, flyAxis, flyDeflection, flyLabel, resetRotateAnchor, setFlyAxis } from '../modes/fly';
import { CameraRig } from '../scene/cameraRig';
import { ObjectRegistry } from '../scene/objects';
import { createWorld, type World } from '../scene/world';
import { hapticConnected, hapticError, hapticModeChange } from '../ui/haptics';
import { speak } from '../ui/speak';
import { UndoStack } from '../undo';

/** Plain-data view of the engine for the React overlays, refreshed at UI.hudRefreshHz. */
export interface HudState {
  mode: ModeName;
  modeColor: string;
  hint: string;
  flyLabel: string;        // '' outside FLY
  flyAxis: FlyAxis | null;
  deflection: number;      // -1..1 along the active MOVE axis
  roll: number; pitch: number; yaw: number;   // post-deadzone state, degrees
  buttons: [boolean, boolean, boolean, boolean];
  status: SourceStatus;
  statusLabel: string;
  connected: boolean;
  stale: boolean;
  sourceKind: SourceKind | null;
  rotateStyle: RotateStyle;
  undoSize: number;
  primitive: PrimitiveName;
  toast: string;
}

type Listener = () => void;

/**
 * Headless port of the web app's main.ts: owns the world, camera rig, glove, modes and undo.
 * The React layer renders its scene, calls frame(dt) every GL frame and polls hud().
 */
export class Engine {
  readonly world: World = createWorld();
  readonly rig = new CameraRig(9 / 16);
  readonly objects = new ObjectRegistry(this.world.scene);
  readonly undo = new UndoStack();
  readonly glove = new GloveInput(0);
  readonly session: GloveSession;
  private ctx: AppContext;
  private raycaster = new THREE.Raycaster();
  private toastText = '';
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<Listener>();
  /** Live simulator, when one is attached. */
  get sim(): TouchSimSource | null { return this.glove.source instanceof TouchSimSource ? this.glove.source : null; }

  constructor() {
    this.raycaster.far = 400;
    this.session = {
      glove: this.glove,
      color: GLOVE_COLOR,
      modeIndex: modeIndexOf(GLOVE_DEFAULT_MODE),
      ndc: new THREE.Vector2(0, 0),
      hit: null,
      ray: new THREE.Ray(),
      primitive: 'cube',
      ghost: null,
      scratch: {},
    };
    this.ctx = { rig: this.rig, objects: this.objects, undo: this.undo, world: this.world, toast: (m) => this.toast(m) };

    this.glove.on('press', ({ button }) => MODES[this.session.modeIndex].onPress?.(this.session, this.ctx, button));
    this.glove.on('tap', ({ button }) => {
      const s = this.session;
      if (button === GLOBAL_ACTIONS.modeNext.button && GLOBAL_ACTIONS.modeNext.gesture === 'tap') return this.setMode(s.modeIndex + 1);
      if (button === GLOBAL_ACTIONS.undo.button && GLOBAL_ACTIONS.undo.gesture === 'tap') return this.doUndo();
      MODES[s.modeIndex].onTap?.(s, this.ctx, button);
    });
    this.glove.on('holdstart', ({ button }) => {
      const s = this.session;
      if (button === GLOBAL_ACTIONS.modePrev.button && GLOBAL_ACTIONS.modePrev.gesture === 'hold') return this.setMode(s.modeIndex - 1);
      if (button === GLOBAL_ACTIONS.undo.button && GLOBAL_ACTIONS.undo.gesture === 'hold') return this.doUndo();
      MODES[s.modeIndex].onHoldStart?.(s, this.ctx, button);
    });
    this.glove.on('holdend', ({ button }) => MODES[this.session.modeIndex].onHoldEnd?.(this.session, this.ctx, button));
    this.glove.on('status', ({ status, source, detail }) => {
      if (status === 'connected') {
        this.toast(source === 'sim' ? 'Simulator on' : `Connected to ${detail ?? 'glove'}`);
        hapticConnected();
        MODES[this.session.modeIndex].enter?.(this.session, this.ctx); // e.g. show the BUILD ghost
      } else if (status === 'error') {
        this.toast(detail ?? 'error');
        hapticError();
      }
      this.notify();
    });

    // Enter the initial mode so its label/hint are right from the start.
    MODES[this.session.modeIndex].enter?.(this.session, this.ctx);
  }

  // ---------- connection ----------
  async connectBle(): Promise<void> {
    try { await this.glove.attach(new BleSource()); } catch { /* status already reported through the source */ }
  }
  async toggleSimulator(): Promise<void> {
    if (this.glove.sourceKind === 'sim') { this.glove.detach(); this.notify(); return; }
    await this.glove.attach(new TouchSimSource());
  }
  disconnect(): void { this.glove.detach(); this.notify(); }
  recenter(): void {
    this.glove.recenter();
    resetRotateAnchor(this.session);
    this.toast('Recentered');
  }

  // ---------- actions ----------
  doUndo(): void {
    const e = this.undo.undo();
    this.toast(e ? `Undid ${e.label}` : 'Nothing to undo');
  }

  setMode(index: number): void {
    const s = this.session;
    const n = MODES.length;
    const next = ((index % n) + n) % n;
    if (next === s.modeIndex && (s.ghost !== null) === (MODES[next].name === 'BUILD')) return;
    MODES[s.modeIndex].exit?.(s, this.ctx);
    s.scratch = {};
    s.modeIndex = next;
    MODES[next].enter?.(s, this.ctx);
    speak(MODE_ORDER[next].toLowerCase());
    hapticModeChange();
    this.notify();
  }

  setFlyAxis(axis: FlyAxis | null): void {
    if (MODE_ORDER[this.session.modeIndex] !== 'FLY') this.setMode(modeIndexOf('FLY'));
    setFlyAxis(this.session, axis);
    this.notify();
  }

  toggleRotateStyle(): void {
    FLY.rotate.style = FLY.rotate.style === 'rate' ? 'absolute' : 'rate';
    resetRotateAnchor(this.session);
    this.toast(FLY.rotate.style === 'absolute' ? 'Rotate: absolute — camera follows your hand angle' : 'Rotate: rate — tilt to keep turning');
    speak(FLY.rotate.style);
  }

  toast(msg: string): void {
    this.toastText = msg;
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.toastText = ''; this.notify(); }, UI.toastMs);
    this.notify();
  }

  /** Subscribe to "something changed that the HUD should show now" (status, mode, toast). */
  subscribe(cb: Listener): () => void { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; }
  private notify(): void { this.listeners.forEach((cb) => cb()); }

  // ---------- per frame ----------
  private updateCursor(): void {
    const s = this.session;
    s.ndc.set(0, 0);
    this.raycaster.setFromCamera(s.ndc, this.rig.camera);
    s.ray.copy(this.raycaster.ray);
    const hits = this.raycaster.intersectObjects(this.objects.selectables, false);
    s.hit = hits.length ? (hits[0].object as THREE.Mesh) : null;
    this.objects.setHover(s.hit);
  }

  /** Advance the simulation by dt seconds (called from the GL frame loop). */
  frame(dtRaw: number): void {
    const dt = Math.min(dtRaw, RENDER.maxFrameDt);
    this.updateCursor();
    const s = this.session;
    if (!s.glove.connected) return;
    MODES[s.modeIndex].update(s, this.ctx, dt);
    // In modes that leave tilt free (BUILD, ERASE), the hand keeps aiming the camera.
    if (ROTATE_IN_MODES.includes(MODE_ORDER[s.modeIndex])) applyRotate(s, this.ctx, dt);
  }

  /** Active FLY axis / deflection for the gizmo (null / 0 outside FLY). */
  gizmoState(): { axis: FlyAxis | null; deflection: number } {
    const inFly = MODE_ORDER[this.session.modeIndex] === 'FLY';
    return { axis: inFly ? flyAxis(this.session) : null, deflection: inFly ? flyDeflection(this.session) : 0 };
  }

  hud(): HudState {
    const s = this.session;
    const g = this.glove;
    const mode = MODE_ORDER[s.modeIndex];
    const stale = g.connected && g.sourceKind === 'ble' && performance.now() - g.lastSampleAt > BLE.staleMs;
    const statusLabel = g.status === 'connected'
      ? `${g.sourceKind === 'sim' ? 'simulator' : g.statusDetail || 'connected'}${stale ? ' · no data' : ''}`
      : g.statusDetail || g.status;
    return {
      mode,
      modeColor: MODE_COLORS[mode],
      hint: MODE_HINTS[mode],
      flyLabel: mode === 'FLY' ? flyLabel(s) : '',
      flyAxis: mode === 'FLY' ? flyAxis(s) : null,
      deflection: mode === 'FLY' ? flyDeflection(s) : 0,
      roll: g.state.roll, pitch: g.state.pitch, yaw: g.state.yaw,
      buttons: [...g.state.buttons] as HudState['buttons'],
      status: g.status,
      statusLabel,
      connected: g.connected,
      stale,
      sourceKind: g.sourceKind,
      rotateStyle: FLY.rotate.style,
      undoSize: this.undo.size,
      primitive: s.primitive,
      toast: this.toastText,
    };
  }
}

/** App-wide singleton so both screens share one glove connection. */
export const engine = new Engine();
