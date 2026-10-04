/**
 * /layouts.html: animated guide to the glove button layouts (Default V1, Default V2, Backup V2).
 * A pixel-art right hand (palm side) shows where each button sits on that glove; a scripted
 * demo presses them one by one and a small pixel viewport shows what each press does, using
 * the same rules as the app. Layout data comes from src/input/buttonMap.ts.
 * The hand and the viewport are drawn on small canvases scaled up with hard pixel edges;
 * every label is ordinary HTML text on top, so it stays sharp and readable.
 */
import { MODE_COLORS, SENSITIVITY, type ModeName } from '../config';
import { BTN, PIN_PLACES, PROFILES, ROLES, roleShort, type GloveVersion, type Profile } from '../input/buttonMap';

// ---------- pixel hand ----------
const HW = 96, HH = 128;   // hand canvas size in art pixels (shown 3x)
type Pt = [number, number];
/** Button positions per glove, in art pixels, plus where its label goes (offset). */
const PIN_POS: Record<GloveVersion, Record<number, { at: Pt; tag: Pt }>> = {
  1: {
    13: { at: [67, 27], tag: [0, -14] }, 25: { at: [52, 19], tag: [0, -14] },
    26: { at: [37, 25], tag: [0, -14] }, 27: { at: [22, 41], tag: [-4, -14] },
  },
  2: {
    25: { at: [67, 24], tag: [6, -14] }, 33: { at: [52, 16], tag: [-2, -11] }, 26: { at: [37, 22], tag: [-4, -14] },
    13: { at: [74, 33], tag: [16, 0] }, 32: { at: [74, 46], tag: [16, 0] }, 14: { at: [74, 59], tag: [16, 0] },
    27: { at: [59, 41], tag: [-13, 8] },
  },
};
const FINGERS: { cx: number; top: number }[] = [{ cx: 22, top: 34 }, { cx: 37, top: 18 }, { cx: 52, top: 12 }, { cx: 67, top: 20 }];
const C = { out: '#141414', glove: '#4b4b4b', light: '#5c5c5c', dark: '#3a3a3a', seam: '#333', btn: '#8b8b8b', btnDark: '#5e5e5e', on: '#e87d0d', onLight: '#ffb35c' };

function px(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string): void { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }

function drawHand(g: CanvasRenderingContext2D, v: GloveVersion, active: number | null, ripple: number): void {
  g.clearRect(0, 0, HW, HH);
  // fingers: outline, body, light left edge, rounded top (corner pixels cut), knuckle seams
  for (const f of FINGERS) {
    const x = f.cx - 6, w = 12, top = f.top, bottom = 72;
    px(g, x - 1, top + 1, w + 2, bottom - top, C.out);
    px(g, x, top, w, 1, C.out);
    px(g, x, top + 1, w, bottom - top, C.glove);
    px(g, x, top + 1, 1, 1, C.out); px(g, x + w - 1, top + 1, 1, 1, C.out);
    px(g, x + 1, top + 2, 2, bottom - top - 2, C.light);
    px(g, x + w - 2, top + 2, 1, bottom - top - 2, C.dark);
    for (const k of [0.38, 0.68]) px(g, x + 2, top + (bottom - top) * k, w - 4, 1, C.seam);
  }
  // palm
  px(g, 13, 64, 64, 54, C.out);
  px(g, 14, 65, 62, 52, C.glove);
  px(g, 14, 65, 1, 1, C.out); px(g, 75, 65, 1, 1, C.out); px(g, 14, 116, 2, 1, C.out); px(g, 74, 116, 2, 1, C.out);
  px(g, 15, 66, 2, 50, C.light);
  px(g, 20, 100, 50, 1, C.seam);
  // thumb (right side, angled down and out)
  for (let t = 0; t < 26; t++) {
    const x = 70 + t * 0.7, y = 70 + t;
    px(g, x - 1, y, 13, 1, C.out);
    px(g, x, y, 11, 1, C.glove);
    px(g, x, y, 1, 1, C.light);
  }
  px(g, 87, 96, 11, 2, C.out);
  // buttons
  for (const [pinStr, p] of Object.entries(PIN_POS[v])) {
    const pin = Number(pinStr);
    const on = pin === active;
    const [x, y] = p.at;
    if (on && ripple > 0) {   // pixel ripple ring
      const r = Math.round(3 + ripple * 6);
      g.fillStyle = `rgba(232,125,13,${(1 - ripple).toFixed(2)})`;
      g.fillRect(x - r, y - r, 2 * r + 1, 1); g.fillRect(x - r, y + r, 2 * r + 1, 1);
      g.fillRect(x - r, y - r, 1, 2 * r + 1); g.fillRect(x + r, y - r, 1, 2 * r + 1);
    }
    px(g, x - 3, y - 3, 7, 7, C.out);
    px(g, x - 2, y - 2, 5, 5, on ? C.on : C.btn);
    px(g, x - 2, y - 2, 5, 1, on ? C.onLight : '#a5a5a5');
    px(g, x - 2, y + 2, 5, 1, on ? '#a85a08' : C.btnDark);
  }
}

// ---------- pixel viewport ----------
const VW = 160, VH = 96;
interface Piece { shape: string; size: number; x: number }
const QUICK = ['cube', 'sphere', 'cylinder'];
const SIZES = ['small', 'medium', 'large'];
const AXES = ['X', 'Y', 'Z'] as const;

function sprite(g: CanvasRenderingContext2D, shape: string, cx: number, base: number, s: number, ghost = false, tint?: string): void {
  const a = ghost ? 0.45 : 1;
  g.globalAlpha = a;
  const col = tint ?? '#e87d0d';
  const top = base - s;
  switch (shape) {
    case 'sphere':
      for (let y = 0; y < s; y++) { const w = Math.round(2 * Math.sqrt(Math.max(0, (s / 2) ** 2 - (y - s / 2 + 0.5) ** 2))); px(g, cx - w / 2, top + y, w, 1, y < s / 3 ? '#ffb35c' : col); }
      break;
    case 'cylinder':
      px(g, cx - s / 3, top, (2 * s) / 3, s, col); px(g, cx - s / 3, top, (2 * s) / 3, 2, '#ffb35c'); px(g, cx - s / 3, top, 1, s, '#ffb35c');
      break;
    case 'nano':
      px(g, cx - s, base - s / 3, 2 * s, s / 4, tint ?? '#1b6fb3');
      for (let i = 0; i < 6; i++) px(g, cx - s + 2 + i * (s / 3), base - s / 12, 1, s / 12 + 1, '#d8b04a');
      px(g, cx - s / 4, base - s / 3 - 2, s / 2, 2, '#1c1c1c'); px(g, cx - s, base - s / 3 - 2, 4, 3, '#c9ccd1');
      break;
    case 'led':
      px(g, cx - 2, top, 5, s / 2, tint ?? '#ff3352'); px(g, cx - 1, top - 1, 3, 1, tint ?? '#ff3352');
      px(g, cx - 1, top + s / 2, 1, s / 2, '#b8bcc2'); px(g, cx + 1, top + s / 2, 1, s / 2 - 1, '#b8bcc2');
      break;
    case 'button':
      px(g, cx - s / 2, base - s / 3, s, s / 3, '#202020'); px(g, cx - s / 3, base - s / 3 - s / 4, (2 * s) / 3, s / 4, tint ?? '#2f6ae0');
      break;
    default:   // cube
      px(g, cx - s / 2, top, s, s, col); px(g, cx - s / 2, top, s, 2, '#ffb35c'); px(g, cx + s / 2 - 2, top, 2, s, '#a85a08');
  }
  g.globalAlpha = 1;
}

interface Sim { mode: ModeName; shape: string; size: number; axis: (typeof AXES)[number] | null; lastAxis: (typeof AXES)[number] | null; sens: number; pieces: Piece[]; flash: number; flashColor: string; fly: number }

function drawView(g: CanvasRenderingContext2D, s: Sim, t: number): void {
  // sky + floor grid with a little perspective
  for (let y = 0; y < VH; y++) px(g, 0, y, VW, 1, y < 44 ? (y < 22 ? '#2a2f38' : '#30353e') : '#3a3a3a');
  const horizon = 44, vx = VW / 2 + (s.mode === 'FLY' && !s.axis ? Math.sin(t / 700) * 10 : 0);
  for (let i = -8; i <= 8; i++) {
    const x0 = vx + i * 6, x1 = vx + i * 30;
    for (let k = 0; k <= 20; k++) { const f = k / 20; px(g, x0 + (x1 - x0) * f, horizon + (VH - horizon) * f, 1, 1, '#4a4a4a'); }
  }
  for (let k = 1; k < 7; k++) { const y = horizon + (VH - horizon) * (k / 7) ** 1.6; px(g, 0, y, VW, 1, '#444'); }
  // pieces on the floor
  s.pieces.forEach((p) => sprite(g, p.shape, p.x, 78, p.size));
  // crosshair
  px(g, VW / 2 - 4, 48, 3, 1, '#e6e6e6'); px(g, VW / 2 + 2, 48, 3, 1, '#e6e6e6'); px(g, VW / 2, 44, 1, 3, '#e6e6e6'); px(g, VW / 2, 50, 1, 3, '#e6e6e6');
  const size = [8, 12, 18][s.size];
  if (s.mode === 'BUILD') sprite(g, s.shape, VW / 2, 78, size, true);
  if (s.mode === 'ERASE') { g.globalAlpha = 0.35; px(g, VW / 2 - size / 2 - 3, 78 - size - 3, size + 6, size + 6, '#ff3352'); g.globalAlpha = 1; }
  if (s.mode === 'FLY') {   // direction hint
    const c = '#e87d0d';
    if (!s.axis) { for (let a = 0; a < 18; a++) { const ang = (a / 18) * Math.PI * 1.5 + t / 400; px(g, VW / 2 + Math.cos(ang) * 10, 48 + Math.sin(ang) * 10, 2, 2, c); } }
    else {
      const d = Math.sin(t / 300) * 6;
      if (s.axis === 'X') { px(g, VW / 2 - 14 + d, 47, 28, 2, c); px(g, VW / 2 + 12 + d, 45, 2, 6, c); }
      if (s.axis === 'Y') { px(g, VW / 2 - 1, 34 + d, 2, 28, c); px(g, VW / 2 - 3, 34 + d, 6, 2, c); }
      if (s.axis === 'Z') { for (let i = 0; i < 12; i++) px(g, VW / 2 - 6 + i + d / 2, 54 - i, 2, 2, c); }
    }
  }
  if (s.flash > 0) { g.globalAlpha = s.flash * 0.35; px(g, 0, 0, VW, VH, s.flashColor); g.globalAlpha = 1; }
}

// ---------- the layout rules (same as the app's glove jobs) ----------
const MODES: ModeName[] = ['FLY', 'BUILD', 'ERASE'];
function fresh(): Sim { return { mode: 'FLY', shape: 'cube', size: 1, axis: null, lastAxis: null, sens: SENSITIVITY.levels[SENSITIVITY.startIndex], pieces: [], flash: 0, flashColor: '#e87d0d', fly: 0 }; }

function apply(s: Sim, role: number, hold: boolean): string {
  const place = () => { const x = 24 + ((s.pieces.length * 29) % 112); s.pieces.push({ shape: s.shape, size: [8, 12, 18][s.size], x }); if (s.pieces.length > 4) s.pieces.shift(); s.flash = 0.6; s.flashColor = '#e87d0d'; return `Placed a ${s.shape}`; };
  const erase = () => { if (!s.pieces.length) return 'Nothing to erase'; const p = s.pieces.pop()!; s.flash = 0.8; s.flashColor = '#ff3352'; return `Erased the ${p.shape}`; };
  const flyToggle = () => { if (s.axis) { s.lastAxis = s.axis; s.axis = null; return 'Rotate: tilt to turn and look'; } s.axis = s.lastAxis ?? 'X'; return `Move along ${s.axis}`; };
  const go = (m: ModeName) => { s.mode = m; return `Mode: ${m}`; };
  switch (role) {
    case BTN.MODE: return go(MODES[(MODES.indexOf(s.mode) + 1) % 3]);
    case BTN.PREV: return go(MODES[(MODES.indexOf(s.mode) + 2) % 3]);
    case BTN.ACTION:
      if (s.mode === 'BUILD') return place();
      if (s.mode === 'ERASE') return erase();
      if (s.axis) { s.lastAxis = s.axis; s.axis = null; return 'Rotate'; }
      s.axis = AXES[((s.lastAxis ? AXES.indexOf(s.lastAxis) : -1) + 1) % 3]; return `Move along ${s.axis}`;
    case BTN.SENS:
      if (hold) { const keep = s.pieces; Object.assign(s, fresh(), { mode: s.mode, pieces: keep, flash: 1, flashColor: '#ffffff' }); return 'Held: start view, roll / pitch / yaw 0, sensitivity 1×'; }
      if (s.mode === 'FLY') { const L = SENSITIVITY.levels; s.sens = L[(L.indexOf(s.sens) + 1) % L.length]; return `Speed ${s.sens}×`; }
      s.size = (s.size + 1) % 3; return `Size: ${SIZES[s.size]}`;
    case BTN.RESET: s.flash = 1; s.flashColor = '#ffffff'; return 'Back to the start view, glove zeroed';
    case BTN.UNDO: s.pieces.pop(); return 'Undo';
    case BTN.OPTION:
      if (s.mode === 'FLY') { s.axis = AXES[((s.axis ? AXES.indexOf(s.axis) : s.lastAxis ? AXES.indexOf(s.lastAxis) : -1) + 1) % 3]; return `Direction: ${s.axis}`; }
      s.shape = QUICK[(QUICK.indexOf(s.shape) + 1) % QUICK.length]; return `Shape: ${s.shape}`;
    case BTN.OPT1: case BTN.OPT2: case BTN.OPT3: {
      const k = role - BTN.OPT1;
      if (s.mode === 'FLY') { s.axis = AXES[k]; return `Direction: ${s.axis}`; }
      s.shape = QUICK[k]; return `Shape: ${s.shape}`;
    }
    case BTN.FLY: return s.mode === 'FLY' ? flyToggle() : go('FLY');
    case BTN.BUILD: return s.mode === 'BUILD' ? place() : go('BUILD');
    case BTN.ERASE: return s.mode === 'ERASE' ? erase() : go('ERASE');
    default: return '';
  }
}

/** Demo sequence per layout: pin presses that show every job. */
const SCRIPTS: Record<string, { pin: number; hold?: boolean }[]> = {
  'default-v1': [{ pin: 13 }, { pin: 25 }, { pin: 26 }, { pin: 25 }, { pin: 13 }, { pin: 25 }, { pin: 13 }, { pin: 25 }, { pin: 26 }, { pin: 27 }, { pin: 26, hold: true }],
  'default-v2': [{ pin: 25 }, { pin: 14 }, { pin: 25 }, { pin: 32 }, { pin: 27 }, { pin: 25 }, { pin: 33 }, { pin: 33 }, { pin: 26 }, { pin: 13 }, { pin: 32 }, { pin: 26 }, { pin: 27 }, { pin: 27, hold: true }],
  'backup-v2': [{ pin: 13 }, { pin: 32 }, { pin: 14 }, { pin: 27 }, { pin: 14 }, { pin: 25 }, { pin: 14 }, { pin: 13 }, { pin: 33 }, { pin: 14 }, { pin: 26 }, { pin: 27, hold: true }],
};

// ---------- page ----------
const app = document.getElementById('app')!;
app.innerHTML = `
  <header class="top">
    <h1>Glove layouts</h1>
    <p>Two right-hand gloves, three layouts. Switch with your voice ("X2D, backup V2"), by typing it, or in the glove panel.</p>
    <a href="/">Open Aloft</a><a href="/controls.html">Basic controls</a>
  </header>
  <nav class="tabs">${PROFILES.map((p) => `<button data-id="${p.id}">${p.name}</button>`).join('')}<span class="glove"></span></nav>
  <section class="stage">
    <div class="card">
      <div class="handwrap"><canvas class="pix" id="hand" width="${HW}" height="${HH}"></canvas><div id="tags"></div></div>
      <p class="handcap">right hand · palm side · thumb on the right</p>
    </div>
    <div class="right">
      <div class="card">
        <div class="now"><div class="press" id="press"></div><div class="what" id="what"></div></div>
        <div class="holdbar" id="holdbar" style="visibility:hidden"><i></i></div>
      </div>
      <div class="card view">
        <div class="viewwrap"><canvas class="pix" id="view" width="${VW}" height="${VH}"></canvas><div class="mode" id="mode"></div><div class="caption" id="caption"></div></div>
        <div class="state" id="state"></div>
      </div>
      <div class="card"><p class="legendcap" id="legendcap"></p><table class="legend" id="legend"></table></div>
    </div>
  </section>`;

const $ = (id: string) => document.getElementById(id)!;
const hand = ($('hand') as HTMLCanvasElement).getContext('2d')!;
const view = ($('view') as HTMLCanvasElement).getContext('2d')!;
let profile: Profile = PROFILES.find((p) => p.id === 'default-v2')!;
let sim = fresh();
let active: number | null = null, pressT = 0, caption = '', runId = 0;
let holdStart = 0, holding = false;

function tagsFor(p: Profile): void {
  const v = p.version;
  $('tags').innerHTML = Object.entries(PIN_POS[v]).map(([pin, pos]) => {
    const role = p.roles[Number(pin)] ?? -1;
    const left = ((pos.at[0] + pos.tag[0]) / HW) * 100, top = ((pos.at[1] + pos.tag[1]) / HH) * 100;
    return `<span class="tag" data-pin="${pin}" style="left:${left}%;top:${top}%"><b>${pin}</b>${roleShort(role)}</span>`;
  }).join('');
  $('legendcap').textContent = `${p.name}: every button`;
  $('legend').innerHTML = Object.keys(PIN_POS[v]).map(Number).sort((a, b) => a - b).map((pin) => {
    const role = p.roles[pin] ?? -1;
    return `<tr data-pin="${pin}"><td>GPIO ${pin}</td><td class="job">${roleShort(role)}</td><td>${role >= 0 ? ROLES[role].label : 'off'}<br><span class="where">${PIN_PLACES[v][pin] ?? ''}</span></td></tr>`;
  }).join('');
  document.querySelector('.tabs .glove')!.textContent = `Glove V${v} · Bluetooth name Aloft-V${v}`;
  document.querySelectorAll<HTMLElement>('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.id === p.id));
}

function showState(): void {
  $('mode').textContent = sim.mode; ($('mode') as HTMLElement).style.color = MODE_COLORS[sim.mode];
  $('caption').textContent = caption;
  $('state').innerHTML = [
    ['Shape', sim.shape], ['Size', SIZES[sim.size]], ['FLY', sim.axis ? `move ${sim.axis}` : 'rotate'], ['Speed', `${sim.sens}×`], ['Pieces', String(sim.pieces.length)],
  ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function run(p: Profile): Promise<void> {
  const id = ++runId;
  profile = p; sim = fresh(); caption = ''; tagsFor(p); showState();
  await sleep(600);
  while (id === runId) {
    for (const step of SCRIPTS[p.id]) {
      if (id !== runId) return;
      const role = p.roles[step.pin] ?? -1;
      active = step.pin; pressT = performance.now();
      document.querySelectorAll('.tag, .legend tr').forEach((el) => el.classList.toggle('on', (el as HTMLElement).dataset.pin === String(step.pin)));
      $('press').innerHTML = `GPIO ${step.pin}<small>${roleShort(role)}${step.hold ? ' · hold' : ''}</small>`;
      $('what').textContent = step.hold ? 'Hold it…' : (role >= 0 ? ROLES[role].label : 'off');
      if (step.hold) {
        holding = true; holdStart = performance.now(); $('holdbar').style.visibility = 'visible';
        await sleep(SENSITIVITY.holdResetMs);
        holding = false;
        if (id !== runId) return;
      }
      caption = apply(sim, role, !!step.hold);
      $('what').textContent = caption;
      showState();
      await sleep(step.hold ? 1400 : 1500);
      $('holdbar').style.visibility = 'hidden';
      active = null;
      await sleep(250);
    }
    sim = fresh(); caption = 'Again from the start'; showState(); await sleep(900);
  }
}

function frame(t: number): void {
  const since = (t - pressT) / 600;
  const ripple = active !== null && since < 1 ? since : 0;
  drawHand(hand, profile.version, active, ripple);
  if (sim.flash > 0) sim.flash = Math.max(0, sim.flash - 0.03);
  drawView(view, sim, t);
  const bar = document.querySelector<HTMLElement>('#holdbar i')!;
  bar.style.width = holding ? `${Math.min(100, ((t - holdStart) / SENSITIVITY.holdResetMs) * 100)}%` : '100%';
  requestAnimationFrame(frame);
}

document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) => (b.onclick = () => { void run(PROFILES.find((p) => p.id === b.dataset.id)!); history.replaceState(null, '', `#${b.dataset.id}`); }));
const fromHash = PROFILES.find((p) => p.id === location.hash.slice(1));
void run(fromHash ?? profile);
requestAnimationFrame(frame);
