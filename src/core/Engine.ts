import * as THREE from 'three';
import { BLE, BUILD, FLY, GEMINI, GLOBAL_ACTIONS, GLOVE_COLOR, GLOVE_DEFAULT_MODE, MODE_COLORS, MODE_HINTS, MODE_ORDER, RENDER, ROTATE_IN_MODES, RUNTIME, SENSITIVITY, UI, UNITS, type FlyAxis, type ModeName, type PrimitiveName, type RotateStyle, type SizeName } from '../config';
import { askGemini, geminiAvailable } from '../ai/gemini';
import { BleSource } from '../input/BleSource';
import { GloveInput } from '../input/GloveInput';
import { TouchSimSource } from '../input/TouchSimSource';
import type { SourceKind, SourceStatus } from '../input/types';
import { MODES, modeIndexOf, type AppContext, type GloveSession } from '../modes';
import { setPrimitive, setSize } from '../modes/build';
import { applyRotate, flyAxis, flyDeflection, flyLabel, resetRotateAnchor, setFlyAxis } from '../modes/fly';
import { CameraRig } from '../scene/cameraRig';
import { ObjectRegistry } from '../scene/objects';
import { createWorld, type World } from '../scene/world';
import { hapticConnected, hapticError, hapticFlyState, hapticModeChange } from '../ui/haptics';
import { speak } from '../ui/speak';
import { UndoStack } from '../undo';

export type VoiceState = 'off' | 'listening' | 'connecting' | 'talking' | 'unsupported';

/** Plain-data view of the engine for the React overlays, refreshed at UI.hudRefreshHz. */
export interface HudState {
  mode: ModeName;
  modeColor: string;
  hint: string;
  flyLabel: string;        // '' outside FLY
  flyAxis: FlyAxis | null;
  deflection: number;      // -1..1 along the active MOVE axis
  roll: number; pitch: number; yaw: number;   // smoothed, recentred tilt (what FLY reads), degrees
  buttons: [boolean, boolean, boolean, boolean];
  status: SourceStatus;
  statusLabel: string;
  connected: boolean;
  stale: boolean;
  sourceKind: SourceKind | null;
  rotateStyle: RotateStyle;
  sensitivity: number;
  undoSize: number;
  primitive: PrimitiveName;
  size: SizeName;
  /** BUILD readout: "<edge> cm @ x, y, z cm" for the ghost, '' otherwise. */
  ghostInfo: string;
  voiceState: VoiceState;
  geminiAvailable: boolean;
  toast: string;
}

type Listener = () => void;
type Action = { button: number; gesture: string } | null;
const is = (a: Action, button: number, gesture: string) => !!a && a.button === button && a.gesture === gesture;

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
  /** X2D voice assistant state, published by the VoiceAssistant component. */
  voiceState: VoiceState = 'off';
  /** Set by the VoiceAssistant component: start / end a voice session. */
  voiceToggle: (() => void) | null = null;
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
      size: BUILD.defaultSize,
      ghost: null,
      scratch: {},
    };
    this.ctx = { rig: this.rig, objects: this.objects, undo: this.undo, world: this.world, toast: (m) => this.toast(m) };

    // Button routing, same as the web main.ts: global actions first, then the mode.
    this.glove.on('press', ({ button }) => {
      const s = this.session;
      if (is(GLOBAL_ACTIONS.modeNext, button, 'press')) return this.setMode(s.modeIndex + 1);
      if (is(GLOBAL_ACTIONS.modePrev, button, 'press')) return this.setMode(s.modeIndex - 1);
      if (is(GLOBAL_ACTIONS.undo, button, 'press')) return this.doUndo();
      if (button === SENSITIVITY.button && MODE_ORDER[s.modeIndex] !== 'BUILD') return this.cycleSensitivity();   // BUILD uses B2 for size
      MODES[s.modeIndex].onPress?.(s, this.ctx, button);
    });
    this.glove.on('tap', ({ button }) => {
      const s = this.session;
      if (is(GLOBAL_ACTIONS.modeNext, button, 'tap')) return this.setMode(s.modeIndex + 1);
      if (is(GLOBAL_ACTIONS.modePrev, button, 'tap')) return this.setMode(s.modeIndex - 1);
      if (is(GLOBAL_ACTIONS.undo, button, 'tap')) return this.doUndo();
      MODES[s.modeIndex].onTap?.(s, this.ctx, button);
    });
    this.glove.on('holdstart', ({ button }) => {
      const s = this.session;
      if (is(GLOBAL_ACTIONS.modeNext, button, 'hold')) return this.setMode(s.modeIndex + 1);
      if (is(GLOBAL_ACTIONS.modePrev, button, 'hold')) return this.setMode(s.modeIndex - 1);
      if (is(GLOBAL_ACTIONS.undo, button, 'hold')) return this.doUndo();
      MODES[s.modeIndex].onHoldStart?.(s, this.ctx, button);
    });
    this.glove.on('holdend', ({ button }) => MODES[this.session.modeIndex].onHoldEnd?.(this.session, this.ctx, button));
    this.glove.on('recentered', () => { resetRotateAnchor(this.session); console.log('[glove] auto-recentered'); });
    this.glove.on('status', ({ status, source, detail }) => {
      console.log(`[glove] ${source ?? '-'} ${status}${detail ? ' · ' + detail : ''}`);
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

    // Trace a sample now and then so a dev log shows live data without flooding.
    let n = 0;
    this.glove.on('raw', (r) => {
      if (n++ % 250 === 0) console.log(`[raw] #${n - 1} roll ${r.roll.toFixed(1)} pitch ${r.pitch.toFixed(1)} yaw ${r.yaw.toFixed(1)} buttons ${r.buttons.map(Number).join('')}`);
    });
    this.glove.on('press', ({ button }) => console.log(`[btn] press B${button}`));

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

  /** Step the global sensitivity multiplier (same as pressing B2 outside BUILD). */
  cycleSensitivity(): void {
    const i = SENSITIVITY.levels.indexOf(RUNTIME.sensitivity);
    RUNTIME.sensitivity = SENSITIVITY.levels[(i + 1) % SENSITIVITY.levels.length];
    this.toast(`Sensitivity ${RUNTIME.sensitivity}×`);
    speak(`sensitivity ${RUNTIME.sensitivity}`);
    hapticFlyState();
  }

  setPrimitive(p: PrimitiveName): void { setPrimitive(this.session, this.ctx, p); this.toast(`Shape: ${p}`); }
  setSize(size: SizeName): void { setSize(this.session, this.ctx, size); this.toast(`Size: ${size}`); }

  toggleRotateStyle(): void {
    FLY.rotate.style = FLY.rotate.style === 'rate' ? 'absolute' : 'rate';
    resetRotateAnchor(this.session);
    this.toast(FLY.rotate.style === 'absolute' ? 'Rotate: absolute — camera follows your hand angle' : 'Rotate: rate — tilt to keep turning');
    speak(FLY.rotate.style);
  }

  toast(msg: string, ms = UI.toastMs): void {
    this.toastText = msg;
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.toastText = ''; this.notify(); }, ms);
    this.notify();
  }

  // ---------- assistants ----------
  setVoiceState(state: VoiceState, detail?: string): void {
    this.voiceState = state;
    if (detail) this.toast(`X2D: ${detail}`);
    else if (state === 'talking') this.toast('X2D is listening');
    this.notify();
  }
  toggleVoice(): void {
    if (this.voiceToggle) this.voiceToggle();
    else this.toast('X2D: voice assistant not available');
  }

  /** Summarise what is in the scene so Gemini can answer questions about it. */
  sceneSummary(): string {
    const built = this.objects.built;
    const cam = this.rig.camera.position;
    const lines = [`camera at x=${cam.x.toFixed(0)} y=${cam.y.toFixed(0)} z=${cam.z.toFixed(0)} cm; mode ${MODE_ORDER[this.session.modeIndex]}; ${built.length} built piece(s)`];
    built.slice(0, 30).forEach((m, i) => {
      const edge = (2 * m.scale.x).toFixed(0);
      lines.push(`${i + 1}. ${m.name} ${edge} cm at x=${m.position.x.toFixed(0)} y=${m.position.y.toFixed(0)} z=${m.position.z.toFixed(0)}`);
    });
    return lines.join('\n');
  }

  /** Ask Gemini about the scene (or anything); show and speak the answer. */
  async askAssistant(question: string): Promise<void> {
    if (!question.trim()) return;
    if (!geminiAvailable()) { this.toast('Gemini: add EXPO_PUBLIC_GEMINI_API_KEY to .env.local'); return; }
    this.toast('Gemini: thinking…');
    try {
      const answer = await askGemini(question, this.sceneSummary());
      this.toast(answer, GEMINI.answerToastMs);
      speak(answer);
    } catch (err) {
      this.toast(`Gemini: ${err instanceof Error ? err.message : String(err)}`, 5000);
    }
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
    // Floor labels face the camera (the web uses sprites; native draws stroke text).
    for (const l of this.world.labels) l.quaternion.copy(this.rig.camera.quaternion);
    const s = this.session;
    if (!s.glove.connected) return;
    // Sensitivity scales every hand-driven rate by scaling the time step the modes integrate over.
    const sdt = dt * RUNTIME.sensitivity;
    MODES[s.modeIndex].update(s, this.ctx, sdt);
    // In modes that leave tilt free (BUILD, ERASE), the hand keeps aiming the camera.
    if (ROTATE_IN_MODES.includes(MODE_ORDER[s.modeIndex])) applyRotate(s, this.ctx, sdt);
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
    let ghostInfo = '';
    if (mode === 'BUILD' && s.ghost) {
      const q = s.ghost.position;
      const edge = (2 * BUILD.sizeScale[s.size]).toFixed(0);
      ghostInfo = `${edge} ${UNITS.name} @ ${q.x.toFixed(0)}, ${q.y.toFixed(0)}, ${(-q.z).toFixed(0)} ${UNITS.name}`;
    }
    return {
      mode,
      modeColor: MODE_COLORS[mode],
      hint: MODE_HINTS[mode],
      flyLabel: mode === 'FLY' ? flyLabel(s) : '',
      flyAxis: mode === 'FLY' ? flyAxis(s) : null,
      deflection: mode === 'FLY' ? flyDeflection(s) : 0,
      roll: g.tilt.roll, pitch: g.tilt.pitch, yaw: g.tilt.yaw,
      buttons: [...g.state.buttons] as HudState['buttons'],
      status: g.status,
      statusLabel,
      connected: g.connected,
      stale,
      sourceKind: g.sourceKind,
      rotateStyle: FLY.rotate.style,
      sensitivity: RUNTIME.sensitivity,
      undoSize: this.undo.size,
      primitive: s.primitive,
      size: s.size,
      ghostInfo,
      voiceState: this.voiceState,
      geminiAvailable: geminiAvailable(),
      toast: this.toastText,
    };
  }
}

/** App-wide singleton so both screens share one glove connection. */
export const engine = new Engine();
