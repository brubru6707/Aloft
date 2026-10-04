import * as THREE from 'three';
import { BLE, BUILD, FLY, GEMINI, GLOBAL_ACTIONS, VOICE, GLOVE_COLOR, GLOVE_DEFAULT_MODE, MODE_COLORS, MODE_HINTS, MODE_ORDER, RENDER, ROTATE_IN_MODES, RUNTIME, SENSITIVITY, UI, UNITS, type FlyAxis, type ModeName, type PrimitiveName, type RotateStyle, type SizeName } from '../config';
import { geminiAvailable, isImperative, planScene } from '../ai/gemini';
import { describeBuilt, rebuildScene, sanitize } from '../ai/scene';
import { normalizeControl, parseControl, type ControlCommand } from '../ai/control';
import { BleSource } from '../input/BleSource';
import { GloveInput } from '../input/GloveInput';
import { TouchSimSource } from '../input/TouchSimSource';
import type { SourceKind, SourceStatus } from '../input/types';
import { MODES, modeIndexOf, type AppContext, type GloveSession } from '../modes';
import { ghostInfo as ghostInfoOf, setPrimitive, setSize } from '../modes/build';
import { applyProfile, currentVersion, OFF, onRolesChange, pinDown, pinsOf, profileOf, roleOf, type GloveVersion } from '../input/buttonMap';
import { onGlovePress, onGloveRelease, type ActionHost } from '../input/gloveActions';
import { applyRotate, flyAxis, flyDeflection, flyLabel, resetRotateAnchor, setFlyAxis } from '../modes/fly';
import { CameraRig } from '../scene/cameraRig';
import { PART_LABELS, isPart } from '../scene/parts';
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
  buttons: boolean[];      // logical jobs (MODE, ACTION, SENS, RESET, UNDO, PREV)
  gloveVersion: GloveVersion;  // which glove's pinout is shown (the connected one)
  pinList: number[];       // its GPIO pins
  pins: boolean[];         // each pin held right now
  roles: number[];         // job per pin (OFF = -1)
  profile: string;         // active layout id, or 'custom'
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
  /** Device list on the right (BUILD / ERASE): unfolded or folded to its header. */
  devicesOpen: boolean;
}

type Listener = () => void;
/** Shape name for toasts and the agent: "Raspberry Pi 4" rather than "rpi". */
export const shapeLabel = (p: PrimitiveName): string => (isPart(p) ? PART_LABELS[p] : p);
const DEVICES_OPEN = /\b(show|open|list|see|display|bring up|pull up)\b.*\b(devices?|parts?( list)?|components?|library|kit|catalog(ue)?)\b|^(devices|parts list|device list)$/i;
const DEVICES_CLOSE = /\b(hide|close|fold|dismiss)\b.*\b(devices?|parts?( list)?|components?|library|kit|catalog(ue)?)\b/i;
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
  /** Device list unfolded (it only shows in BUILD / ERASE). */
  devicesOpen = true;
  /** Set by the VoiceAssistant component: start / end a voice session. */
  voiceToggle: (() => void) | null = null;
  /** Live simulator, when one is attached. */
  get sim(): TouchSimSource | null { return this.glove.source instanceof TouchSimSource ? this.glove.source : null; }

  constructor() {
    onRolesChange(() => this.notify());
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

    // Button routing, same as the web main.ts: shared jobs, then global actions, then the mode.
    const host: ActionHost = {
      ctx: this.ctx,
      setMode: (_s, i) => this.setMode(i),
      resetView: () => this.resetView(),
      cycleSensitivity: () => this.cycleSensitivity(),
      resetSensitivity: () => { RUNTIME.sensitivity = SENSITIVITY.holdResetLevel; this.notify(); },
      toast: (m) => this.toast(m),
    };
    this.glove.on('release', ({ button }) => { onGloveRelease(host, this.session, button); });
    this.glove.on('press', ({ button }) => {
      const s = this.session;
      if (onGlovePress(host, s, button)) return;
      if (is(GLOBAL_ACTIONS.modeNext, button, 'press')) return this.setMode(s.modeIndex + 1);
      if (is(GLOBAL_ACTIONS.modePrev, button, 'press')) return this.setMode(s.modeIndex - 1);
      if (is(GLOBAL_ACTIONS.reset, button, 'press')) return this.resetView();
      if (is(GLOBAL_ACTIONS.undo, button, 'press')) return this.doUndo();
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
  /** Pinky (B2): camera back to the start pose and the glove zeroed to 0/0/0. */
  resetView(): void {
    this.rig.reset();
    this.glove.recenter();
    resetRotateAnchor(this.session);
    this.toast('Reset: start view, roll / pitch / yaw = 0');
    hapticFlyState();
  }

  doUndo(): void {
    const e = this.undo.undo();
    this.toast(e ? `Undid ${e.label}` : 'Nothing to undo');
  }

  setMode(index: number): void {
    const s = this.session;
    const n = MODES.length;
    const next = ((index % n) + n) % n;
    if (next === s.modeIndex && (s.ghost !== null) === (MODES[next].name === 'BUILD' || MODES[next].name === 'ERASE')) return;
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

  setPrimitive(p: PrimitiveName): void { setPrimitive(this.session, this.ctx, p); this.toast(`Shape: ${shapeLabel(p)}`); }

  /** "X2D, show me the devices": unfold (or fold) the device list, switching to BUILD if flying. */
  showDevices(open: boolean): string {
    this.devicesOpen = open;
    if (open && MODE_ORDER[this.session.modeIndex] === 'FLY') this.setMode(modeIndexOf('BUILD'));
    this.notify();
    return open ? `The device list is open on the right: ${BUILD.devices.map(shapeLabel).join(', ')}.` : 'Closed the device list.';
  }
  setSize(size: SizeName): void { setSize(this.session, this.ctx, size); this.toast(`Size: ${size}`); }

  toggleRotateStyle(): void { this.setRotateStyle(FLY.rotate.style === 'rate' ? 'absolute' : 'rate'); }

  setRotateStyle(style: RotateStyle): void {
    FLY.rotate.style = style;
    resetRotateAnchor(this.session);
    this.toast(style === 'absolute' ? 'Rotate: absolute — camera follows your hand angle' : 'Rotate: rate — tilt to keep turning');
    speak(style);
    this.notify();
  }

  /**
   * Apply a settings command from the X2D agent (set_control) or a typed request: mode, shape,
   * size, sensitivity, FLY state, rotate style, or reset the view. Returns a sentence for the agent.
   */
  applyControl(cmd: ControlCommand): string {
    switch (cmd.setting) {
      case 'mode': this.setMode(modeIndexOf(cmd.value as ModeName)); return `Switched to ${cmd.value}.`;
      case 'shape': {
        // A shape only shows in BUILD / ERASE: "X2D, use a servo" while flying switches to BUILD.
        if (MODE_ORDER[this.session.modeIndex] === 'FLY') this.setMode(modeIndexOf('BUILD'));
        this.setPrimitive(cmd.value as PrimitiveName); this.notify(); return `Shape set to ${shapeLabel(cmd.value as PrimitiveName)}.`;
      }
      case 'size': this.setSize(cmd.value as SizeName); this.notify(); return `Piece size set to ${cmd.value}.`;
      case 'sensitivity': {
        const levels = SENSITIVITY.levels;
        const cur = RUNTIME.sensitivity;
        // Levels run high to low; "up" is the next larger value, "down" the next smaller.
        const next = cmd.value === 'up' ? (levels.filter((v) => v > cur).sort((a, b) => a - b)[0] ?? cur)
          : cmd.value === 'down' ? (levels.filter((v) => v < cur).sort((a, b) => b - a)[0] ?? cur)
          : levels.reduce((a, b) => (Math.abs(b - Number(cmd.value)) < Math.abs(a - Number(cmd.value)) ? b : a));
        RUNTIME.sensitivity = next;
        this.toast(`Sensitivity ${next}×`);
        hapticFlyState();
        return `Sensitivity set to ${next}.`;
      }
      case 'fly_state': {
        const axis = cmd.value === 'rotate' ? null : (cmd.value as FlyAxis);
        this.setFlyAxis(axis);
        return axis ? `Moving along ${axis} now.` : 'Rotating now.';
      }
      case 'rotate_style': this.setRotateStyle(cmd.value as RotateStyle); return `Rotation style set to ${cmd.value}.`;
      case 'reset_view': this.resetView(); return 'Centred you back at the start.';
      case 'controls': { const p = applyProfile(cmd.value); if (!p) return `Unknown layout ${cmd.value}.`; this.toast(`Layout: ${p.name}`); return `Glove buttons switched to ${p.name}.`; }
    }
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
    const f = (v: number) => (Math.round(v * 10) / 10).toString();
    const lines = [`camera at x=${cam.x.toFixed(0)} y=${cam.y.toFixed(0)} z=${cam.z.toFixed(0)} cm; mode ${MODE_ORDER[this.session.modeIndex]}; ${built.length} built piece(s)`];
    built.slice(0, 40).forEach((m, i) => {
      lines.push(`${i + 1}. ${m.name} ${f(2 * m.scale.x)}×${f(2 * m.scale.y)}×${f(2 * m.scale.z)} cm at x=${f(m.position.x)} y=${f(m.position.y)} z=${f(m.position.z)}`);
    });
    return lines.join('\n');
  }

  /** Ask Gemini about the scene (or anything); show and speak the answer. */
  /**
   * Hand a typed or spoken request to Gemini with the scene (same as the web app). A question gets
   * an answer in a toast; an instruction ("make it an actual stickman") rebuilds the pieces as one
   * undoable step. Returns the plan so the voice agent's build_scene tool can report back.
   */
  async askAssistant(request: string, opts: { forceRebuild?: boolean } = {}): Promise<{ action: 'answer' | 'rebuild'; message: string; pieces: number } | null> {
    if (!request.trim()) return null;
    // "show me the devices" unfolds the device list; no Gemini call.
    if (DEVICES_CLOSE.test(request)) return { action: 'answer', message: this.showDevices(false), pieces: 0 };
    if (DEVICES_OPEN.test(request)) return { action: 'answer', message: this.showDevices(true), pieces: 0 };
    // "switch to build", "use a cylinder", "center me" … are settings, not builds: no Gemini call.
    const cmd = parseControl(request);
    if (cmd) { const message = this.applyControl(cmd); return { action: 'answer', message, pieces: 0 }; }
    if (!geminiAvailable()) { this.toast('Gemini: add EXPO_PUBLIC_GEMINI_API_KEY to .env.local'); return null; }
    this.toast(`X2D: thinking about “${request}”…`, 4000);
    try {
      const plan = await planScene(request, describeBuilt(this.ctx), this.sceneSummary(), opts.forceRebuild ?? isImperative(request));
      if (plan.action === 'rebuild' && plan.pieces?.length) {
        const specs = plan.pieces.map(sanitize).filter((p): p is NonNullable<typeof p> => !!p).slice(0, GEMINI.maxPieces);
        const n = rebuildScene(specs, this.ctx, this.session.color, `X2D: ${request.slice(0, 40)}`);
        this.toast(`${plan.message} (${n} pieces)`, GEMINI.answerToastMs);
        this.notify();
        return { action: 'rebuild', message: plan.message, pieces: n };
      }
      this.toast(plan.message, GEMINI.answerToastMs);
      return { action: 'answer', message: plan.message, pieces: 0 };
    } catch (err) {
      this.toast(`X2D: ${err instanceof Error ? err.message : String(err)}`, 5000);
      return null;
    }
  }

  /** Client tools for the ElevenLabs agent (names in VOICE.tools): you talk, the agent calls these, Gemini builds. */
  agentTools(): Record<string, (params: Record<string, unknown>) => Promise<string> | string> {
    return {
      [VOICE.tools.build]: async (params) => {
        const request = String(params.request ?? params.description ?? '').trim();
        if (!request) return 'No request given. Ask the user what to build.';
        const result = await this.askAssistant(request, { forceRebuild: true });
        if (!result) return 'The build failed (Gemini did not return a usable layout). Apologise briefly and offer to try again.';
        return result.action === 'rebuild'
          ? `Built it: ${result.message} (${result.pieces} pieces, now in the scene). Tell the user in one short sentence.`
          : result.message;
      },
      [VOICE.tools.describe]: () => this.sceneSummary(),
      [VOICE.tools.control]: (params) => {
        const cmd = normalizeControl(params.setting, params.value);
        if ('error' in cmd) return `Could not change that: ${cmd.error}.`;
        return this.applyControl(cmd);
      },
      // Optional `open` (true / "open" by default, false / "close" to fold the list).
      [VOICE.tools.devices]: (params) => this.showDevices(!/^(false|close|hide|no|0)$/i.test(String(params.open ?? 'true').trim())),
      [VOICE.tools.undo]: () => { const e = this.undo.undo(); this.toast(e ? `Undid ${e.label}` : 'Nothing to undo'); this.notify(); return e ? `Undid ${e.label}.` : 'There was nothing to undo.'; },
    };
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
    const v: GloveVersion = g.version ?? currentVersion();
    let ghostInfo = '';
    if ((mode === 'BUILD' || mode === 'ERASE') && s.ghost) ghostInfo = ghostInfoOf(s);
    return {
      mode,
      modeColor: MODE_COLORS[mode],
      hint: MODE_HINTS[mode],
      flyLabel: mode === 'FLY' ? flyLabel(s) : '',
      flyAxis: mode === 'FLY' ? flyAxis(s) : null,
      deflection: mode === 'FLY' ? flyDeflection(s) : 0,
      roll: g.tilt.roll, pitch: g.tilt.pitch, yaw: g.tilt.yaw,
      buttons: [...g.state.buttons],
      gloveVersion: v,
      pinList: [...pinsOf(v)],
      pins: pinsOf(v).map((pin) => { const r = roleOf(v, pin); return g.sourceKind === 'sim' ? r !== OFF && !!g.state.buttons[r] : pinDown(g.pinMask, v, pin); }),
      roles: pinsOf(v).map((pin) => roleOf(v, pin)),
      profile: profileOf(v),
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
      devicesOpen: this.devicesOpen,
    };
  }
}

/** App-wide singleton so both screens share one glove connection. */
export const engine = new Engine();
