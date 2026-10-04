import * as THREE from 'three';
import { BUILD, CAMERA_START, FLY, GEMINI, GLOBAL_ACTIONS, PROJECTS, GLOVE_DEFAULT_MODE, INPUT, MODE_ORDER, ROTATE_IN_MODES, RUNTIME, SENSITIVITY, VOICE, type FlyAxis, type PrimitiveName, type SizeName } from './config';
import { geminiAvailable, geminiQuotaStatus, isImperative, listGeminiModels, planScene } from './ai/gemini';
import { describeBuilt, rebuildScene, sanitize } from './ai/scene';
import { normalizeControl, parseControl, type ControlCommand } from './ai/control';
import { setPrimitive, setSize } from './modes/build';
import { exportSTL } from './export';
import { GloveManager } from './input/GloveManager';
import { MODES, modeIndexOf, type AppContext, type GloveSession } from './modes';
import { applyRotate, flyAxis, flyDeflection, resetRotateAnchor, setFlyAxis } from './modes/fly';
import { AxisGizmo } from './ui/axisGizmo';
import { VoiceAssistant, whistle } from './ui/voice';
import { CameraRig } from './scene/cameraRig';
import { ObjectRegistry } from './scene/objects';
import { createWorld } from './scene/world';
import { Hud } from './ui/hud';
import { speak } from './ui/speak';
import { UndoStack } from './undo';
import { captureScene, deleteProject, getProject, listProjects, loadScene, newId, putProject, renameProject, thumbnailOf } from './projects';
import { Dashboard } from './ui/dashboard';

// ---------- Renderer / scene ----------
const canvas = document.getElementById('scene') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;

const world = createWorld();
const rig = new CameraRig(window.innerWidth / window.innerHeight);
const objects = new ObjectRegistry(world.scene);
world.buildings.forEach((b) => objects.registerSelectable(b));
const undo = new UndoStack();
const gizmo = new AxisGizmo();
gizmo.top = 44 + 14;   // just under the top bar (--bar-h in style.css)
gizmo.size = 130;
const voice = new VoiceAssistant();

// ---------- Input ----------
const gloves = new GloveManager(canvas);

const sessions: GloveSession[] = gloves.gloves.map((glove) => ({
  glove,
  color: gloves.color(glove.gloveId),
  modeIndex: modeIndexOf(GLOVE_DEFAULT_MODE[glove.gloveId] ?? 'FLY'),
  ndc: new THREE.Vector2(0, 0),
  hit: null,
  ray: new THREE.Ray(),
  primitive: 'cube',
  size: BUILD.defaultSize,
  ghost: null,
  scratch: {},
}));

// ---------- HUD ----------
const hud = new Hud(document.getElementById('hud')!, gloves, {
  connectBle: (id) => gloves.connectBle(id),
  toggleSim: (id) => gloves.toggleSimulator(id),
  recenter: (id) => { gloves.recenter(id); resetRotateAnchor(sessions[id]); hud.toast(`Glove ${id + 1} recentered`); },
  disconnect: (id) => gloves.disconnect(id),
  exportSTL: () => {
    const n = exportSTL(objects.builtGroup);
    hud.toast(n ? `Exported ${n} object${n === 1 ? '' : 's'} to STL` : 'Nothing built yet — place something in BUILD mode');
  },
  undo: doUndo,
  setMode: (id, index) => setMode(sessions[id], index),
  setFlyAxis: (id, axis) => {
    const s = sessions[id];
    if (MODE_ORDER[s.modeIndex] !== 'FLY') setMode(s, modeIndexOf('FLY'));
    setFlyAxis(s, axis);
  },
  cycleSensitivity,
  toggleVoice: () => voice.toggle(),
  askGemini: (q) => void askAssistant(q),
  setPrimitive: (id, p) => { setPrimitive(sessions[id], ctx, p); hud.toast(`Shape: ${p}`); },
  setSize: (id, size) => { setSize(sessions[id], ctx, size); hud.toast(`Size: ${size}`); },
  openProjects: () => dashboard.toggle(),
  saveProject: () => saveProject(),
  toggleRotateStyle: () => setRotateStyle(FLY.rotate.style === 'rate' ? 'absolute' : 'rate'),
});

function setRotateStyle(style: 'rate' | 'absolute'): void {
  FLY.rotate.style = style;
  sessions.forEach(resetRotateAnchor);
  hud.syncRotateButton();
  hud.toast(style === 'absolute' ? 'Rotate: absolute — camera follows your hand angle' : 'Rotate: rate — tilt to keep turning');
  speak(style);
}

/**
 * Apply a settings command from the X2D agent (set_control) or a typed request:
 * mode, shape, size, sensitivity, FLY state, rotate style, or reset the view.
 * Returns a short sentence for the agent to read back.
 */
function applyControl(cmd: ControlCommand): string {
  const s0 = sessions[0];
  switch (cmd.setting) {
    case 'mode': setMode(s0, modeIndexOf(cmd.value as (typeof MODE_ORDER)[number])); return `Switched to ${cmd.value}.`;
    case 'shape': setPrimitive(s0, ctx, cmd.value as PrimitiveName); hud.toast(`Shape: ${cmd.value}`); return `Shape set to ${cmd.value}.`;
    case 'size': setSize(s0, ctx, cmd.value as SizeName); hud.toast(`Size: ${cmd.value}`); return `Piece size set to ${cmd.value}.`;
    case 'sensitivity': {
      const levels = SENSITIVITY.levels;
      const cur = RUNTIME.sensitivity;
      // Levels run high to low; "up" is the next larger value, "down" the next smaller.
      const next = cmd.value === 'up' ? (levels.filter((v) => v > cur).sort((a, b) => a - b)[0] ?? cur)
        : cmd.value === 'down' ? (levels.filter((v) => v < cur).sort((a, b) => b - a)[0] ?? cur)
        : levels.reduce((a, b) => (Math.abs(b - Number(cmd.value)) < Math.abs(a - Number(cmd.value)) ? b : a));
      RUNTIME.sensitivity = next;
      hud.syncSensitivityButton();
      hud.toast(`Sensitivity ${next}×`);
      return `Sensitivity set to ${next}.`;
    }
    case 'fly_state': {
      if (MODE_ORDER[s0.modeIndex] !== 'FLY') setMode(s0, modeIndexOf('FLY'));
      const axis = cmd.value === 'rotate' ? null : (cmd.value as FlyAxis);
      setFlyAxis(s0, axis);
      return axis ? `Moving along ${axis} now.` : 'Rotating now.';
    }
    case 'rotate_style': setRotateStyle(cmd.value as 'rate' | 'absolute'); return `Rotation style set to ${cmd.value}.`;
    case 'reset_view': resetView(); return 'Centred you back at the start.';
  }
}

const ctx: AppContext = { rig, objects, undo, world, toast: (m) => hud.toast(m) };

// ---------- Projects (save / continue) ----------
let currentProjectId: string | null = null;
let currentProjectName: string | null = null;
let dirty = false;
let autosaveTimer: number | null = null;

/**
 * Thumbnail of the scene. Renders one frame on the spot and reads it straight away (the WebGL
 * buffer is only readable right after a render), so it also works while the tab is in the background.
 */
function sceneThumbnail(): string | undefined {
  renderer.render(world.scene, rig.camera);
  return thumbnailOf(canvas);
}

function syncProjectLabel(): void { hud.syncProject(currentProjectName, dirty); }

/** Every edit goes through the undo stack, so hooking it marks the project as changed. */
function markDirty(): void {
  dirty = true;
  syncProjectLabel();
  if (!currentProjectId) return;   // nothing to autosave into until the build has a name
  if (autosaveTimer !== null) clearTimeout(autosaveTimer);
  autosaveTimer = window.setTimeout(() => { autosaveTimer = null; void writeProject(currentProjectId!, currentProjectName!, false); }, PROJECTS.autosaveMs);
}
{
  const push = undo.push.bind(undo);
  const pop = undo.undo.bind(undo);
  undo.push = (e) => { push(e); markDirty(); };
  undo.undo = () => { const e = pop(); if (e) markDirty(); return e; };
}

async function writeProject(id: string, name: string, announce: boolean): Promise<void> {
  const existing = getProject(id);
  const { pieces, camera } = captureScene(ctx);
  const thumbnail = sceneThumbnail();
  try {
    putProject({ id, name, createdAt: existing?.createdAt ?? Date.now(), updatedAt: Date.now(), pieces, camera, thumbnail: thumbnail ?? existing?.thumbnail });
    if (currentProjectId === id) { dirty = false; syncProjectLabel(); }
    if (announce) hud.toast(`Saved “${name}” (${pieces.length} piece${pieces.length === 1 ? '' : 's'})`);
    if (dashboard.visible) dashboard.render();
  } catch (err) {
    hud.toast(`Could not save: ${err instanceof Error ? err.message : String(err)}`, 5000);
  }
}

/** Save button / Cmd+S: save the open project, or ask for a name in the dashboard for a new one. */
function saveProject(): void {
  if (currentProjectId && currentProjectName) { void writeProject(currentProjectId, currentProjectName, true); return; }
  dashboard.show();
  document.querySelector<HTMLInputElement>('#dashboard .name')?.focus();
}

function saveAsNew(name: string): void {
  currentProjectId = newId();
  currentProjectName = name;
  void writeProject(currentProjectId, name, true);
}

/** Before switching away, keep unnamed work instead of throwing it away. */
async function keepUnsavedWork(): Promise<void> {
  if (autosaveTimer !== null) { clearTimeout(autosaveTimer); autosaveTimer = null; if (currentProjectId) await writeProject(currentProjectId, currentProjectName!, false); }
  if (!currentProjectId && dirty && objects.built.length) {
    const name = `Unsaved build ${new Date().toLocaleString()}`;
    await writeProject(newId(), name, false);
    hud.toast(`Kept your unsaved work as “${name}”`, 3000);
  }
}

async function openProject(id: string): Promise<void> {
  const p = getProject(id);
  if (!p) { hud.toast('That project is gone'); return; }
  if (id !== currentProjectId) await keepUnsavedWork();
  loadScene(ctx, p.pieces, p.camera, sessions[0].color);
  sessions.forEach(resetRotateAnchor);
  currentProjectId = p.id; currentProjectName = p.name; dirty = false;
  syncProjectLabel();
  hud.toast(`Opened “${p.name}” (${p.pieces.length} piece${p.pieces.length === 1 ? '' : 's'})`);
}

async function newProject(): Promise<void> {
  await keepUnsavedWork();
  loadScene(ctx, [], { pos: [...CAMERA_START.pos], yaw: CAMERA_START.yaw, pitch: CAMERA_START.pitch }, sessions[0].color);
  sessions.forEach(resetRotateAnchor);
  currentProjectId = null; currentProjectName = null; dirty = false;
  syncProjectLabel();
  hud.toast('New empty project');
}

const dashboard = new Dashboard(document.getElementById('hud')!, {
  list: listProjects,
  currentId: () => currentProjectId,
  open: (id) => void openProject(id),
  rename: (id, name) => {
    renameProject(id, name);
    if (id === currentProjectId) { currentProjectName = name; syncProjectLabel(); }
    hud.toast(`Renamed to “${name}”`);
  },
  remove: (id) => {
    deleteProject(id);
    if (id === currentProjectId) { currentProjectId = null; currentProjectName = null; dirty = objects.built.length > 0; syncProjectLabel(); }
    hud.toast('Project deleted');
  },
  saveAs: saveAsNew,
  newProject: () => void newProject(),
});
syncProjectLabel();

function cycleSensitivity(): void {
  const i = SENSITIVITY.levels.indexOf(RUNTIME.sensitivity);
  RUNTIME.sensitivity = SENSITIVITY.levels[(i + 1) % SENSITIVITY.levels.length];
  hud.syncSensitivityButton();
  hud.toast(`Sensitivity ${RUNTIME.sensitivity}×`);
  speak(`sensitivity ${RUNTIME.sensitivity}`);
}

/** Summarise what is in the scene so Gemini can answer questions about it. */
function sceneSummary(): string {
  const built = objects.built;
  const cam = rig.camera.position;
  const f = (v: number) => (Math.round(v * 10) / 10).toString();
  const lines = [`camera at x=${cam.x.toFixed(0)} y=${cam.y.toFixed(0)} z=${cam.z.toFixed(0)} cm; mode ${MODE_ORDER[sessions[0].modeIndex]}; ${built.length} built piece(s)`];
  built.slice(0, 40).forEach((m, i) => {
    lines.push(`${i + 1}. ${m.name} ${f(2 * m.scale.x)}×${f(2 * m.scale.y)}×${f(2 * m.scale.z)} cm at x=${f(m.position.x)} y=${f(m.position.y)} z=${f(m.position.z)}`);
  });
  return lines.join('\n');
}

/**
 * Hand a spoken or typed request to Gemini with the scene. A question gets a spoken
 * answer; an instruction ("make it an actual stickman") rebuilds the pieces as one
 * undoable step and says what was done. Returns the plan so scripts can check it.
 */
async function askAssistant(request: string, opts: { speakReply?: boolean; forceRebuild?: boolean } = {}): Promise<{ action: 'answer' | 'rebuild'; message: string; pieces: number } | null> {
  const speakReply = opts.speakReply ?? true;   // false when the ElevenLabs agent is the one talking
  if (!request.trim()) return null;
  // "switch to build", "use a cylinder", "center me" … are settings, not builds: no Gemini call.
  const cmd = parseControl(request);
  if (cmd) { const message = applyControl(cmd); return { action: 'answer', message, pieces: 0 }; }
  if (!geminiAvailable()) { hud.toast('Gemini: add VITE_GEMINI_API_KEY to .env.local'); return null; }
  hud.toast(`X2D: thinking about “${request}”…`, 4000);
  try {
    const plan = await planScene(request, describeBuilt(ctx), sceneSummary(), opts.forceRebuild ?? isImperative(request));
    if (plan.action === 'rebuild' && plan.pieces?.length) {
      const specs = plan.pieces.map(sanitize).filter((p): p is NonNullable<typeof p> => !!p).slice(0, GEMINI.maxPieces);
      const n = rebuildScene(specs, ctx, sessions[0].color, `X2D: ${request.slice(0, 40)}`);
      hud.toast(`${plan.message} (${n} pieces, Undo to take it back)`, 6000);
      if (speakReply) speak(plan.message);
      return { action: 'rebuild', message: plan.message, pieces: n };
    }
    hud.toast(plan.message, 6000);
    if (speakReply) speak(plan.message);
    return { action: 'answer', message: plan.message, pieces: 0 };
  } catch (err) {
    hud.toast(`X2D: ${err instanceof Error ? err.message : String(err)}`, 5000);
    return null;
  }
}

/**
 * Client tools for the ElevenLabs agent: you talk to the agent, the agent calls build_scene,
 * Gemini plans the pieces, the app places them, and the agent reads back the result.
 * Tool names must match the agent's tools in the ElevenLabs dashboard (VOICE.tools).
 */
voice.setClientTools({
  [VOICE.tools.build]: async (params) => {
    const request = String(params.request ?? params.description ?? '').trim();
    if (!request) return 'No request given. Ask the user what to build.';
    const result = await askAssistant(request, { speakReply: false, forceRebuild: true });
    if (!result) return 'The build failed (Gemini did not return a usable layout). Apologise briefly and offer to try again.';
    return result.action === 'rebuild'
      ? `Built it: ${result.message} (${result.pieces} pieces, now in the scene). Tell the user in one short sentence.`
      : result.message;
  },
  [VOICE.tools.describe]: () => sceneSummary(),
  [VOICE.tools.control]: (params) => {
    const cmd = normalizeControl(params.setting, params.value);
    if ('error' in cmd) return `Could not change that: ${cmd.error}.`;
    return applyControl(cmd);
  },
  [VOICE.tools.undo]: () => { const e = undo.undo(); hud.toast(e ? `Undid ${e.label}` : 'Nothing to undo'); return e ? `Undid ${e.label}.` : 'There was nothing to undo.'; },
});

/** Pinky (B2): camera back to the start pose and every glove zeroed to 0/0/0. */
function resetView(): void {
  rig.camera.position.set(...CAMERA_START.pos);
  rig.yaw = CAMERA_START.yaw;
  rig.pitch = CAMERA_START.pitch;
  rig.apply();
  gloves.recenterAll();
  sessions.forEach(resetRotateAnchor);
  hud.toast('Reset: start view, roll / pitch / yaw = 0');
}

function doUndo(): void {
  const e = undo.undo();
  hud.toast(e ? `Undid ${e.label}` : 'Nothing to undo');
}

// ---------- Mode switching ----------
function setMode(s: GloveSession, index: number): void {
  const n = MODES.length;
  const next = ((index % n) + n) % n;
  if (next === s.modeIndex && (s.ghost !== null) === (MODES[next].name === 'BUILD' || MODES[next].name === 'ERASE')) return;
  MODES[s.modeIndex].exit?.(s, ctx);
  s.scratch = {};
  s.modeIndex = next;
  MODES[next].enter?.(s, ctx);
  speak(MODE_ORDER[next].toLowerCase());
}

const is = (a: { button: number; gesture: string } | null, button: number, gesture: string) => !!a && a.button === button && a.gesture === gesture;
gloves.onAll('press', ({ gloveId, button }) => {
  const s = sessions[gloveId];
  if (is(GLOBAL_ACTIONS.modeNext, button, 'press')) return setMode(s, s.modeIndex + 1);
  if (is(GLOBAL_ACTIONS.modePrev, button, 'press')) return setMode(s, s.modeIndex - 1);
  if (is(GLOBAL_ACTIONS.reset, button, 'press')) return resetView();
  if (is(GLOBAL_ACTIONS.undo, button, 'press')) return doUndo();
  if (button === SENSITIVITY.button && MODE_ORDER[s.modeIndex] === 'FLY') return cycleSensitivity();   // BUILD and ERASE use this button for size
  MODES[s.modeIndex].onPress?.(s, ctx, button);
});
gloves.onAll('tap', ({ gloveId, button }) => {
  const s = sessions[gloveId];
  if (is(GLOBAL_ACTIONS.modeNext, button, 'tap')) return setMode(s, s.modeIndex + 1);
  if (is(GLOBAL_ACTIONS.modePrev, button, 'tap')) return setMode(s, s.modeIndex - 1);
  if (is(GLOBAL_ACTIONS.undo, button, 'tap')) return doUndo();
  MODES[s.modeIndex].onTap?.(s, ctx, button);
});
gloves.onAll('holdstart', ({ gloveId, button }) => {
  const s = sessions[gloveId];
  if (is(GLOBAL_ACTIONS.modeNext, button, 'hold')) return setMode(s, s.modeIndex + 1);
  if (is(GLOBAL_ACTIONS.modePrev, button, 'hold')) return setMode(s, s.modeIndex - 1);
  if (is(GLOBAL_ACTIONS.undo, button, 'hold')) return doUndo();
  MODES[s.modeIndex].onHoldStart?.(s, ctx, button);
});
gloves.onAll('holdend', ({ gloveId, button }) => {
  const s = sessions[gloveId];
  MODES[s.modeIndex].onHoldEnd?.(s, ctx, button);
});
gloves.onAll('recentered', ({ gloveId }) => resetRotateAnchor(sessions[gloveId]));
gloves.onAll('status', ({ gloveId, status, source, detail }) => {
  const s = sessions[gloveId];
  if (status === 'connected') {
    hud.toast(`Glove ${gloveId + 1}: ${source === 'sim' ? 'simulator on' : `connected to ${detail ?? 'glove'}`}`);
    MODES[s.modeIndex].enter?.(s, ctx); // e.g. show the BUILD ghost
  } else if (status === 'error') {
    hud.toast(`Glove ${gloveId + 1}: ${detail ?? 'error'}`);
  }
});

voice.onState((state, detail) => {
  hud.syncVoiceButton(state);
  if (detail) hud.toast(`X2D: ${detail}`);
  else if (state === 'talking') hud.toast('X2D is listening');
});
voice.onRequest((text) => void askAssistant(text));
if (VOICE.autoListen) voice.startListening();

// Enter the initial mode for glove 1 so its label/hint are right from the start.
MODES[sessions[0].modeIndex].enter?.(sessions[0], ctx);

// ---------- Per-frame ----------
const raycaster = new THREE.Raycaster();
raycaster.far = 400;
const clock = new THREE.Clock();

function updateCursors(): void {
  let anyHover: THREE.Mesh | null = null;
  for (const s of sessions) {
    if (s.glove.gloveId === 0) s.ndc.set(0, 0);
    else {
      // Second glove steers its own cursor with hand tilt.
      s.ndc.set(
        THREE.MathUtils.clamp(s.glove.state.roll / INPUT.maxTiltDeg, -0.95, 0.95),
        THREE.MathUtils.clamp(s.glove.state.pitch / INPUT.maxTiltDeg, -0.95, 0.95),
      );
    }
    raycaster.setFromCamera(s.ndc, rig.camera);
    s.ray.copy(raycaster.ray);
    if (!s.glove.connected && s.glove.gloveId !== 0) { s.hit = null; continue; }
    const hits = raycaster.intersectObjects(objects.selectables, false);
    s.hit = hits.length ? (hits[0].object as THREE.Mesh) : null;
    if (s.hit && !anyHover) anyHover = s.hit;
  }
  objects.setHover(anyHover);
}

function frame(): void {
  const dt = Math.min(clock.getDelta(), 0.05);
  updateCursors();
  for (const s of sessions) {
    // Glove 0 drives without a connection only in the sense of showing the mode; modes need input.
    if (!s.glove.connected) continue;
    // Sensitivity scales every hand-driven rate by scaling the time step the modes integrate over.
    const sdt = dt * RUNTIME.sensitivity;
    MODES[s.modeIndex].update(s, ctx, sdt);
    // Glove 1 owns the camera: in modes that leave tilt free (BUILD, ERASE), it keeps aiming.
    if (s.glove.gloveId === 0 && ROTATE_IN_MODES.includes(MODE_ORDER[s.modeIndex])) applyRotate(s, ctx, sdt);
  }
  hud.update(sessions, window.innerWidth, window.innerHeight);
  renderer.render(world.scene, rig.camera);
  const s0 = sessions[0];
  const inFly = MODE_ORDER[s0.modeIndex] === 'FLY';
  gizmo.render(renderer, rig.camera, inFly ? flyAxis(s0) : null, inFly ? flyDeflection(s0) : 0, window.innerWidth, window.innerHeight);
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  rig.camera.aspect = window.innerWidth / window.innerHeight;
  rig.camera.updateProjectionMatrix();
});

// Keyboard shortcuts that don't belong to the simulator.
window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
  if (e.key === 's' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveProject(); return; }
  if (e.key === 'z' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); doUndo(); }
  if (e.key === 'r' && !e.metaKey && !e.ctrlKey) { gloves.recenterAll(); sessions.forEach(resetRotateAnchor); }
  if (e.key === 'Tab') { e.preventDefault(); setMode(sessions[0], sessions[0].modeIndex + (e.shiftKey ? -1 : 1)); }
});

frame();
hud.toast('Click “Simulator” or “Connect Glove” to start');
if (PROJECTS.showDashboardOnStart && listProjects().length) dashboard.show();   // continue a saved build

// Debug handle for the console / automated tests.
(window as unknown as { __aloft: unknown }).__aloft = { rig, objects, undo, gloves, sessions, setMode, MODES, ctx, voice, whistle, askAssistant, isImperative, sceneSummary, listGeminiModels, geminiQuota: geminiQuotaStatus, dashboard, openProject, saveAsNew, listProjects };
