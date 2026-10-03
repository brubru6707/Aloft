import * as THREE from 'three';
import { BUILD, FLY, GLOBAL_ACTIONS, GLOVE_DEFAULT_MODE, INPUT, MODE_ORDER, ROTATE_IN_MODES, RUNTIME, SENSITIVITY } from './config';
import { setPrimitive, setSize } from './modes/build';
import { exportSTL } from './export';
import { GloveManager } from './input/GloveManager';
import { MODES, modeIndexOf, type AppContext, type GloveSession } from './modes';
import { applyRotate, flyAxis, flyDeflection, resetRotateAnchor, setFlyAxis } from './modes/fly';
import { AxisGizmo } from './ui/axisGizmo';
import { CameraRig } from './scene/cameraRig';
import { ObjectRegistry } from './scene/objects';
import { createWorld } from './scene/world';
import { Hud } from './ui/hud';
import { speak } from './ui/speak';
import { UndoStack } from './undo';

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
  setPrimitive: (id, p) => { setPrimitive(sessions[id], ctx, p); hud.toast(`Shape: ${p}`); },
  setSize: (id, size) => { setSize(sessions[id], ctx, size); hud.toast(`Size: ${size}`); },
  toggleRotateStyle: () => {
    FLY.rotate.style = FLY.rotate.style === 'rate' ? 'absolute' : 'rate';
    sessions.forEach(resetRotateAnchor);
    hud.syncRotateButton();
    hud.toast(FLY.rotate.style === 'absolute' ? 'Rotate: absolute — camera follows your hand angle' : 'Rotate: rate — tilt to keep turning');
    speak(FLY.rotate.style);
  },
});

const ctx: AppContext = { rig, objects, undo, world, toast: (m) => hud.toast(m) };

function cycleSensitivity(): void {
  const i = SENSITIVITY.levels.indexOf(RUNTIME.sensitivity);
  RUNTIME.sensitivity = SENSITIVITY.levels[(i + 1) % SENSITIVITY.levels.length];
  hud.syncSensitivityButton();
  hud.toast(`Sensitivity ${RUNTIME.sensitivity}×`);
  speak(`sensitivity ${RUNTIME.sensitivity}`);
}

function doUndo(): void {
  const e = undo.undo();
  hud.toast(e ? `Undid ${e.label}` : 'Nothing to undo');
}

// ---------- Mode switching ----------
function setMode(s: GloveSession, index: number): void {
  const n = MODES.length;
  const next = ((index % n) + n) % n;
  if (next === s.modeIndex && s.ghost !== null === (MODES[next].name === 'BUILD')) return;
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
  if (is(GLOBAL_ACTIONS.undo, button, 'press')) return doUndo();
  if (button === SENSITIVITY.button && MODE_ORDER[s.modeIndex] !== 'BUILD') return cycleSensitivity();   // BUILD uses B2 for size
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
gloves.onAll('status', ({ gloveId, status, source, detail }) => {
  const s = sessions[gloveId];
  if (status === 'connected') {
    hud.toast(`Glove ${gloveId + 1}: ${source === 'sim' ? 'simulator on' : `connected to ${detail ?? 'glove'}`}`);
    MODES[s.modeIndex].enter?.(s, ctx); // e.g. show the BUILD ghost
  } else if (status === 'error') {
    hud.toast(`Glove ${gloveId + 1}: ${detail ?? 'error'}`);
  }
});

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
  if (e.key === 'z' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); doUndo(); }
  if (e.key === 'r' && !e.metaKey && !e.ctrlKey) { gloves.recenterAll(); sessions.forEach(resetRotateAnchor); }
  if (e.key === 'Tab') { e.preventDefault(); setMode(sessions[0], sessions[0].modeIndex + (e.shiftKey ? -1 : 1)); }
});

frame();
hud.toast('Click “Simulator” or “Connect Glove” to start');

// Debug handle for the console / automated tests.
(window as unknown as { __aloft: unknown }).__aloft = { rig, objects, undo, gloves, sessions, setMode, MODES, ctx };
