import * as THREE from 'three';
import { GLOBAL_ACTIONS, GLOVE_DEFAULT_MODE, INPUT, MODE_ORDER } from './config';
import { exportSTL } from './export';
import { GloveManager } from './input/GloveManager';
import { MODES, modeIndexOf, type AppContext, type GloveSession } from './modes';
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
  ghost: null,
  scratch: {},
}));

// ---------- HUD ----------
const hud = new Hud(document.getElementById('hud')!, gloves, {
  connectBle: (id) => gloves.connectBle(id),
  toggleSim: (id) => gloves.toggleSimulator(id),
  recenter: (id) => { gloves.recenter(id); hud.toast(`Glove ${id + 1} recentered`); },
  disconnect: (id) => gloves.disconnect(id),
  exportSTL: () => {
    const n = exportSTL(objects.builtGroup);
    hud.toast(n ? `Exported ${n} object${n === 1 ? '' : 's'} to STL` : 'Nothing built yet — place something in BUILD mode');
  },
  undo: doUndo,
});

const ctx: AppContext = { rig, objects, undo, world, toast: (m) => hud.toast(m) };

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

gloves.onAll('tap', ({ gloveId, button }) => {
  const s = sessions[gloveId];
  if (button === GLOBAL_ACTIONS.modeNext.button && GLOBAL_ACTIONS.modeNext.gesture === 'tap') return setMode(s, s.modeIndex + 1);
  if (button === GLOBAL_ACTIONS.undo.button && GLOBAL_ACTIONS.undo.gesture === 'tap') return doUndo();
  MODES[s.modeIndex].onTap?.(s, ctx, button);
});
gloves.onAll('holdstart', ({ gloveId, button }) => {
  const s = sessions[gloveId];
  if (button === GLOBAL_ACTIONS.modePrev.button && GLOBAL_ACTIONS.modePrev.gesture === 'hold') return setMode(s, s.modeIndex - 1);
  if (button === GLOBAL_ACTIONS.undo.button && GLOBAL_ACTIONS.undo.gesture === 'hold') return doUndo();
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
    MODES[s.modeIndex].update(s, ctx, dt);
  }
  hud.update(sessions, window.innerWidth, window.innerHeight);
  renderer.render(world.scene, rig.camera);
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
  if (e.key === 'r' && !e.metaKey && !e.ctrlKey) gloves.recenterAll();
  if (e.key === 'Tab') { e.preventDefault(); setMode(sessions[0], sessions[0].modeIndex + (e.shiftKey ? -1 : 1)); }
});

frame();
hud.toast('Click “Simulator” or “Connect Glove” to start');

// Debug handle for the console / automated tests.
(window as unknown as { __aloft: unknown }).__aloft = { rig, objects, undo, gloves, sessions, setMode };
