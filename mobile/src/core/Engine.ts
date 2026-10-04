import * as THREE from 'three';
import { subtract } from '../scene/carve';
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
export interface GloveBrief {
  connected: boolean; label: string; mode: ModeName; modeColor: string; hint: string; flyLabel: string; hover: boolean; color: string;
  sourceKind: SourceKind | null; status: SourceStatus;
  version: GloveVersion; pinList: number[]; pins: boolean[]; roles: number[]; profile: string;
}

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
  /** Which glove the panels act on, whether the view is split, and a short summary of each glove. */
  selected: number;
  split: boolean;
  gloves: GloveBrief[];
}

type Listener = () => void;
/** Shape name for toasts and the agent: "Raspberry Pi 4" rather than "rpi". */
export const shapeLabel = (p: PrimitiveName): string => (isPart(p) ? PART_LABELS[p] : p);
const DEVICES_OPEN = /\b(show|open|list|see|display|bring up|pull up)\b.*\b(devices?|parts?( list)?|components?|library|kit|catalog(ue)?)\b|^(devices|parts list|device list)$/i;
const DEVICES_CLOSE = /\b(hide|close|fold|dismiss)\b.*\b(devices?|parts?( list)?|components?|library|kit|catalog(ue)?)\b/i;
const GLOVE2_COLOR = '#4f8ff7';   // glove 2's ghost / cursor colour (glove 1 is GLOVE_COLOR)
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
  /** Up to two gloves, each with its own session; in split view glove 2 also gets its own camera. */
  readonly gloves = [new GloveInput(0), new GloveInput(1)];
  readonly sessions: GloveSession[];
  readonly rig2 = new CameraRig(9 / 16);
  /** Which glove the on-screen controls (Glove / Build tabs, mode chips) act on. */
  selected = 0;
  /** The glove whose button was pressed last: X2D / typed settings go to it. */
  private lastGlove = 0;
  private wasSplit = false;
  get glove(): GloveInput { return this.gloves[this.selected]; }
  get session(): GloveSession { return this.sessions[this.selected]; }
  /** Both gloves connected: the view splits in half, one camera each. */
  get split(): boolean { return this.gloves[0].connected && this.gloves[1].connected; }
  /** The camera a glove drives: glove 2's own in split view, otherwise the shared one. */
  rigOf(i: number): CameraRig { return this.split && i === 1 ? this.rig2 : this.rig; }
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
  get sim(): TouchSimSource | null {
    const g = this.gloves.find((x) => x.source instanceof TouchSimSource);
    return g ? (g.source as TouchSimSource) : null;
  }

  constructor() {
    onRolesChange(() => this.notify());
    this.raycaster.far = 400;
    const mkSession = (g: GloveInput, color: string, mode: ModeName): GloveSession => ({
      glove: g,
      color,
      modeIndex: modeIndexOf(mode),
      ndc: new THREE.Vector2(0, 0),
      hit: null,
      ray: new THREE.Ray(),
      primitive: 'cube',
      size: BUILD.defaultSize,
      ghost: null,
      scratch: {},
    });
    this.sessions = [mkSession(this.gloves[0], GLOVE_COLOR, GLOVE_DEFAULT_MODE), mkSession(this.gloves[1], GLOVE2_COLOR, 'BUILD')];
    this.ctx = { rig: this.rig, objects: this.objects, undo: this.undo, world: this.world, toast: (m) => this.toast(m) };
    this.wire(0);
    this.wire(1);

    // Dev check that carving (CSG) works on this phone's JS engine: shows up in the Metro log.
    if (__DEV__) setTimeout(() => {
      try {
        const big = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2)); big.scale.setScalar(6); big.position.set(0, 6, 0); big.updateMatrixWorld(true);
        const g = subtract(big, new THREE.BoxGeometry(2, 2, 2), new THREE.Matrix4().makeTranslation(0, 12, 0));
        console.log(`[carve] self-test: ${g === null ? 'GONE (bad)' : g === undefined ? 'no change (bad)' : `carved ok, ${g.getAttribute('position').count} verts`}`);
      } catch (err) { console.log('[carve] self-test failed:', err instanceof Error ? err.message : String(err)); }
    }, 1500);
    // Enter glove 1's initial mode so its label/hint are right from the start (glove 2's on connect).
    MODES[this.sessions[0].modeIndex].enter?.(this.sessions[0], this.ctx);
  }

  /** Run fn with ctx.rig = the camera glove i drives (modes move / aim ctx.rig). */
  private as<T>(i: number, fn: () => T): T {
    const prev = this.ctx.rig;
    this.ctx.rig = this.rigOf(i);
    try { return fn(); } finally { this.ctx.rig = prev; }
  }

  /** Button routing for one glove, same as the web main.ts: shared jobs, global actions, then the mode. */
  private wire(i: number): void {
    const g = this.gloves[i];
    const s = this.sessions[i];
    const host: ActionHost = {
      ctx: this.ctx,
      setMode: (ss, idx) => this.setModeFor(ss, idx),
      resetView: () => this.resetViewFor(i),
      cycleSensitivity: () => this.cycleSensitivity(),
      resetSensitivity: () => { RUNTIME.sensitivity = SENSITIVITY.holdResetLevel; this.notify(); },
      toast: (m) => this.toast(m),
    };
    const tag = `G${i + 1}`;
    g.on('release', ({ button }) => this.as(i, () => { onGloveRelease(host, s, button); }));
    g.on('press', ({ button }) => this.as(i, () => {
      this.lastGlove = i;
      if (onGlovePress(host, s, button)) return;
      if (is(GLOBAL_ACTIONS.modeNext, button, 'press')) return this.setModeFor(s, s.modeIndex + 1);
      if (is(GLOBAL_ACTIONS.modePrev, button, 'press')) return this.setModeFor(s, s.modeIndex - 1);
      if (is(GLOBAL_ACTIONS.reset, button, 'press')) return this.resetViewFor(i);
      if (is(GLOBAL_ACTIONS.undo, button, 'press')) return this.doUndo();
      MODES[s.modeIndex].onPress?.(s, this.ctx, button);
    }));
    g.on('tap', ({ button }) => this.as(i, () => {
      if (is(GLOBAL_ACTIONS.modeNext, button, 'tap')) return this.setModeFor(s, s.modeIndex + 1);
      if (is(GLOBAL_ACTIONS.modePrev, button, 'tap')) return this.setModeFor(s, s.modeIndex - 1);
      if (is(GLOBAL_ACTIONS.undo, button, 'tap')) return this.doUndo();
      MODES[s.modeIndex].onTap?.(s, this.ctx, button);
    }));
    g.on('holdstart', ({ button }) => this.as(i, () => {
      if (is(GLOBAL_ACTIONS.modeNext, button, 'hold')) return this.setModeFor(s, s.modeIndex + 1);
      if (is(GLOBAL_ACTIONS.modePrev, button, 'hold')) return this.setModeFor(s, s.modeIndex - 1);
      if (is(GLOBAL_ACTIONS.undo, button, 'hold')) return this.doUndo();
      MODES[s.modeIndex].onHoldStart?.(s, this.ctx, button);
    }));
    g.on('holdend', ({ button }) => this.as(i, () => MODES[s.modeIndex].onHoldEnd?.(s, this.ctx, button)));
    g.on('recentered', () => { resetRotateAnchor(s); console.log(`[glove] ${tag} auto-recentered`); });
    g.on('status', ({ status, source, detail }) => {
      console.log(`[glove] ${tag} ${source ?? '-'} ${status}${detail ? ' · ' + detail : ''}`);
      if (status === 'connected') {
        this.toast(`Glove ${i + 1}: ${source === 'sim' ? 'simulator on' : `connected to ${detail ?? 'glove'}`}`);
        hapticConnected();
        MODES[s.modeIndex].enter?.(s, this.ctx); // e.g. show the BUILD ghost
      } else if (status === 'error') {
        this.toast(`Glove ${i + 1}: ${detail ?? 'error'}`);
        hapticError();
      } else if (status === 'disconnected' && s.ghost) {
        MODES[s.modeIndex].exit?.(s, this.ctx);   // hide its ghost / eraser
      }
      this.notify();
    });
    // Trace a sample now and then so a dev log shows live data without flooding.
    let n = 0;
    g.on('raw', (r) => {
      if (n++ % 250 === 0) console.log(`[raw] ${tag} #${n - 1} roll ${r.roll.toFixed(1)} pitch ${r.pitch.toFixed(1)} yaw ${r.yaw.toFixed(1)} buttons ${r.buttons.map(Number).join('')}`);
    });
    g.on('press', ({ button }) => console.log(`[btn] ${tag} press B${button}`));
  }

  /** Which glove the on-screen controls act on. */
  selectGlove(i: number): void { this.selected = i === 1 ? 1 : 0; this.notify(); }

  // ---------- connection ----------
  async connectBle(): Promise<void> {
    // Connect on a glove that already has a real glove: put the new one in the free slot instead.
    if (this.glove.sourceKind === 'ble' && this.glove.connected) {
      const free = this.gloves.findIndex((g) => !g.connected || g.sourceKind === 'sim');
      if (free >= 0) this.selected = free;
    }
    const i = this.selected;
    // Glove 2 prefers the 7-button "Aloft-V2"; glove 1 prefers any other glove (falls back to whatever is found).
    const prefer = i === 1 ? (name: string) => /v2/i.test(name) : (name: string) => !/v2/i.test(name);
    try { await this.gloves[i].attach(new BleSource(prefer)); } catch { /* status already reported through the source */ }
  }
  async toggleSimulator(): Promise<void> {
    if (this.glove.sourceKind === 'sim') { this.glove.detach(); this.notify(); return; }
    this.gloves.forEach((g) => { if (g !== this.glove && g.sourceKind === 'sim') g.detach(); });   // one simulator at a time
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
  resetView(): void { this.resetViewFor(this.selected); }
  /** One glove's camera back to the start pose and that glove zeroed to 0/0/0. */
  resetViewFor(i: number): void {
    this.rigOf(i).reset();
    this.gloves[i].recenter();
    resetRotateAnchor(this.sessions[i]);
    this.toast(this.split ? `Glove ${i + 1}: start view, roll / pitch / yaw = 0` : 'Reset: start view, roll / pitch / yaw = 0');
    hapticFlyState();
  }

  doUndo(): void {
    const e = this.undo.undo();
    this.toast(e ? `Undid ${e.label}` : 'Nothing to undo');
  }

  setMode(index: number): void { this.setModeFor(this.session, index); }
  setModeFor(s: GloveSession, index: number): void {
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
  /** Point the panels at the glove X2D / typed settings should change (last used, else a connected one). */
  private targetVoiceGlove(): void {
    const i = this.gloves[this.lastGlove].connected ? this.lastGlove : this.gloves.findIndex((g) => g.connected);
    if (i >= 0 && i !== this.selected) { this.selected = i; this.notify(); }
  }

  showDevices(open: boolean): string {
    this.targetVoiceGlove();
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
    this.targetVoiceGlove();
    switch (cmd.setting) {
      case 'mode': this.setMode(modeIndexOf(cmd.value as ModeName)); return `Switched to ${cmd.value}.`;
      case 'shape': {
        // The shape goes to EVERY connected glove (you wear one at a time, so whichever one you place
        // with gets it); a flying glove switches to BUILD so the piece shows.
        const p = cmd.value as PrimitiveName;
        const targets = this.sessions.filter((s) => s.glove.connected);
        if (!targets.length) targets.push(this.session);
        for (const s of targets) {
          if (MODE_ORDER[s.modeIndex] === 'FLY') this.setModeFor(s, modeIndexOf('BUILD'));
          setPrimitive(s, this.ctx, p);
        }
        this.toast(`Shape: ${shapeLabel(p)}`);
        this.notify();
        const who = targets.length > 1 ? 'both gloves' : `glove ${this.sessions.indexOf(targets[0]) + 1}`;
        return `Shape set to ${shapeLabel(p)} on ${who}. The next piece placed will be a ${shapeLabel(p)}.`;
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
  /** Why the last askAssistant returned null (read by build_scene so the agent can say what went wrong). */
  private lastAssistantError = '';
  /** A build in progress: a second build_scene while it runs is answered "still working" instead of racing it. */
  private buildingNow: string | null = null;

  async askAssistant(request: string, opts: { forceRebuild?: boolean } = {}): Promise<{ action: 'answer' | 'rebuild'; message: string; pieces: number } | null> {
    this.lastAssistantError = '';
    if (!request.trim()) return null;
    // "show me the devices" unfolds the device list; no Gemini call.
    if (DEVICES_CLOSE.test(request)) return { action: 'answer', message: this.showDevices(false), pieces: 0 };
    if (DEVICES_OPEN.test(request)) return { action: 'answer', message: this.showDevices(true), pieces: 0 };
    // "switch to build", "use a cylinder", "center me" … are settings, not builds: no Gemini call.
    const cmd = parseControl(request);
    if (cmd) { const message = this.applyControl(cmd); return { action: 'answer', message, pieces: 0 }; }
    if (!geminiAvailable()) { this.lastAssistantError = 'No Gemini key'; this.toast('Gemini: add EXPO_PUBLIC_GEMINI_API_KEY to .env.local'); return null; }
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
      this.lastAssistantError = err instanceof Error ? err.message : String(err);
      this.toast(`X2D: ${this.lastAssistantError}`, 5000);
      return null;
    }
  }

  /** What the agent should say when a build failed: the reason in plain words, and that settings still work. */
  private buildFailureReply(reason: string): string {
    const still = 'Settings like shapes, modes, size and sensitivity still work. Tell the user in one short sentence.';
    if (/quota|429/i.test(reason)) return `The scene builder (Gemini) is out of quota right now, so it can't build new scenes. ${still}`;
    if (/no gemini key/i.test(reason)) return `The scene builder (Gemini) isn't set up here (no API key). ${still}`;
    if (/timed out/i.test(reason)) return 'The scene builder took too long and gave up. Apologise briefly and offer to try again.';
    return `The build failed${reason ? ` (${reason.slice(0, 120)})` : ''}. Apologise briefly and offer to try again.`;
  }

  /** Client tools for the ElevenLabs agent (names in VOICE.tools): you talk, the agent calls these, Gemini builds. */
  agentTools(): Record<string, (params: Record<string, unknown>) => Promise<string> | string> {
    return {
      [VOICE.tools.build]: async (params) => {
        const request = String(params.request ?? params.description ?? '').trim();
        if (!request) return 'No request given. Ask the user what to build.';
        // Settings and the device list are instant and always allowed; only a Gemini build waits for the one in progress.
        const instant = !!parseControl(request) || DEVICES_OPEN.test(request) || DEVICES_CLOSE.test(request);
        if (!instant && this.buildingNow) return `Still building "${this.buildingNow}". Tell the user it will be ready in a moment, then they can ask again.`;
        let result: Awaited<ReturnType<Engine['askAssistant']>> = null;
        if (!instant) this.buildingNow = request;
        try { result = await this.askAssistant(request, { forceRebuild: true }); }
        catch (err) { console.warn('[x2d] build_scene failed:', err); return this.buildFailureReply(err instanceof Error ? err.message : String(err)); }
        finally { if (!instant) this.buildingNow = null; }
        if (!result) return this.buildFailureReply(this.lastAssistantError);
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
    // Each glove aims with the crosshair at the centre of its own view.
    this.sessions.forEach((s, i) => {
      s.ndc.set(0, 0);
      this.raycaster.setFromCamera(s.ndc, this.rigOf(i).camera);
      s.ray.copy(this.raycaster.ray);
      const hits = this.raycaster.intersectObjects(this.objects.selectables, false);
      s.hit = hits.length ? (hits[0].object as THREE.Mesh) : null;
    });
    this.objects.setHover(this.session.hit);
  }

  /** Advance the simulation by dt seconds (called from the GL frame loop). */
  frame(dtRaw: number): void {
    const dt = Math.min(dtRaw, RENDER.maxFrameDt);
    if (this.split !== this.wasSplit) {
      this.wasSplit = this.split;
      if (this.split) {   // glove 2's camera starts where the shared one is, then each steers its own
        this.rig2.camera.position.copy(this.rig.camera.position);
        this.rig2.yaw = this.rig.yaw; this.rig2.pitch = this.rig.pitch; this.rig2.apply();
      }
      this.sessions.forEach(resetRotateAnchor);
      this.toast(this.split ? 'Two gloves: split view, one camera each' : 'One glove: full view');
      this.notify();
    }
    this.updateCursor();
    // Floor labels face the camera (the web uses sprites; native draws stroke text).
    for (const l of this.world.labels) l.quaternion.copy(this.rig.camera.quaternion);
    // Sensitivity scales every hand-driven rate by scaling the time step the modes integrate over.
    const sdt = dt * RUNTIME.sensitivity;
    this.sessions.forEach((s, i) => {
      if (!s.glove.connected) return;
      this.as(i, () => {
        MODES[s.modeIndex].update(s, this.ctx, sdt);
        // In modes that leave tilt free (BUILD, ERASE), the hand keeps aiming its camera.
        if (ROTATE_IN_MODES.includes(MODE_ORDER[s.modeIndex])) applyRotate(s, this.ctx, sdt);
      });
    });
  }

  /** Active FLY axis / deflection for the gizmo (null / 0 outside FLY). */
  gizmoState(i = this.selected): { axis: FlyAxis | null; deflection: number } {
    const s = this.sessions[i];
    const inFly = MODE_ORDER[s.modeIndex] === 'FLY';
    return { axis: inFly ? flyAxis(s) : null, deflection: inFly ? flyDeflection(s) : 0 };
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
      selected: this.selected,
      split: this.split,
      gloves: this.gloves.map((gg, i) => {
        const ss = this.sessions[i];
        const m = MODE_ORDER[ss.modeIndex];
        const gv: GloveVersion = gg.version ?? (i === 0 ? 1 : 2);
        return {
          sourceKind: gg.sourceKind, status: gg.status,
          version: gv,
          pinList: [...pinsOf(gv)],
          pins: pinsOf(gv).map((pin) => { const r = roleOf(gv, pin); return gg.sourceKind === 'sim' ? r !== OFF && !!gg.state.buttons[r] : pinDown(gg.pinMask, gv, pin); }),
          roles: pinsOf(gv).map((pin) => roleOf(gv, pin)),
          profile: profileOf(gv),
          connected: gg.connected,
          label: gg.connected ? (gg.sourceKind === 'sim' ? 'simulator' : gg.statusDetail || 'connected') : gg.status === 'connecting' ? 'connecting…' : 'off',
          mode: m, modeColor: MODE_COLORS[m], hint: MODE_HINTS[m],
          flyLabel: m === 'FLY' ? flyLabel(ss) : '',
          hover: !!ss.hit,
          color: ss.color,
        };
      }),
    };
  }
}

/** App-wide singleton so both screens share one glove connection. */
export const engine = new Engine();
