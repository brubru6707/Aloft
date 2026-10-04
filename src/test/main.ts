/**
 * Aloft glove test bench (/test.html). No 3D scene: connect the glove over BLE or USB,
 * watch live values, record a session with labelled markers, and copy a compact text
 * report to paste into a chat or an issue.
 */
import { FLY, INPUT } from '../config';
import { BleSource } from '../input/BleSource';
import { GloveInput } from '../input/GloveInput';
import { SerialSource } from '../input/SerialSource';
import type { GloveSource, RawSample, SourceStatus } from '../input/types';

interface Rec { t: number; roll: number; pitch: number; yaw: number; mask: number }
interface Marker { t: number; label: string }
interface Ev { t: number; text: string }

const PRESETS = ['still', 'turn left', 'turn right', 'roll left', 'roll right', 'pitch up', 'pitch down',
  'press B0', 'hold B0', 'press B1', 'hold B1', 'press B2', 'press B3'];
const BUTTON_GPIO = [13, 25, 26, 27];   // after BUTTON_MAP: B3 = pinky (GPIO 27)

const glove = new GloveInput(0);
let source: GloveSource | null = null;
let raw: RawSample | null = null;
let rawZero = { roll: 0, pitch: 0, yaw: 0 };   // display offset so the raw readouts can be recentred too
let rawCount = 0; let rateWindow: number[] = [];
let recording = false; let recStart = 0;
let recs: Rec[] = []; let markers: Marker[] = []; let events: Ev[] = [];
const logLines: string[] = [];

const app = document.getElementById('app')!;
app.innerHTML = `
  <h1>Aloft glove test <small>live values, recording, pasteable report</small></h1>
  <div class="hint">Connect, press <b>Start recording</b>, do each movement while tapping its marker, press <b>Stop</b>, then <b>Copy report</b>. USB resets the glove when the port opens: wait ~2 s and keep it still for the gyro calibration.</div>

  <section class="panel">
    <h2>Connection</h2>
    <div class="row">
      <button id="ble" class="primary">Connect BLE</button>
      <button id="usb">Connect USB</button>
      <button id="disc" disabled>Disconnect</button>
      <button id="recenter">Recenter</button>
      <span id="status" class="status">disconnected</span>
      <span id="rate" class="status"></span>
    </div>
  </section>

  <section class="panel">
    <h2>Live · raw from glove (minus Recenter offset)</h2>
    <div class="readouts">
      ${['ROLL', 'PITCH', 'YAW'].map((n) => `<div class="readout"><span>${n}</span><b id="raw-${n.toLowerCase()}">—</b><div class="bar"><i id="bar-${n.toLowerCase()}"></i></div></div>`).join('')}
    </div>
    <h2 style="margin-top:14px">Live · as the app sees it (recentered, inverted, smoothed; state = after deadzone)</h2>
    <div class="readouts">
      ${['ROLL', 'PITCH', 'YAW'].map((n) => `<div class="readout"><span>${n} tilt / state</span><b id="app-${n.toLowerCase()}">—</b></div>`).join('')}
    </div>
    <h2 style="margin-top:14px">Buttons</h2>
    <div class="buttons">${[0, 1, 2, 3].map((b) => `<i id="b${b}">B${b}<small>GPIO ${BUTTON_GPIO[b]}</small></i>`).join('')}</div>
  </section>

  <section class="panel">
    <h2>Recording</h2>
    <div class="row">
      <button id="rec" class="primary" disabled>Start recording</button>
      <button id="stop" class="danger" disabled>Stop</button>
      <span id="recstate" class="status"></span>
    </div>
    <div class="row" style="margin-top:10px">
      <input id="marker" type="text" placeholder="marker label, e.g. turning hand left slowly" />
      <button id="addmarker" disabled>Add marker</button>
      <span class="hint">or tap a preset:</span>
    </div>
    <div class="markers" style="margin-top:8px">${PRESETS.map((p) => `<button class="preset" data-l="${p}" disabled>${p}</button>`).join('')}</div>
    <div id="markerlist" class="log" style="margin-top:8px"></div>
  </section>

  <section class="panel">
    <h2>Event log (what the app classifies)</h2>
    <div id="log" class="log">—</div>
  </section>

  <section class="panel">
    <h2>Report</h2>
    <div class="row" style="margin-bottom:8px">
      <button id="copy" disabled>Copy report</button>
      <button id="download" disabled>Download .txt</button>
      <span id="copied" class="status"></span>
    </div>
    <textarea id="report" placeholder="Stop a recording to generate the report."></textarea>
  </section>
`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const fmt = (v: number, d = 1) => (v >= 0 ? '+' : '') + v.toFixed(d);
const now = () => performance.now();
const tRel = (t: number) => ((t - recStart) / 1000).toFixed(2) + 's';

function log(text: string): void {
  const line = `${recording ? tRel(now()) : '--'} ${text}`;
  logLines.push(line);
  if (logLines.length > 40) logLines.shift();
  $('log').textContent = logLines.slice().reverse().join('\n');
  if (recording) events.push({ t: now(), text });
}

function setStatus(status: SourceStatus, detail?: string): void {
  const el = $('status');
  el.textContent = status === 'connected' ? `connected · ${detail ?? ''}` : detail ? `${status} · ${detail}` : status;
  el.className = 'status' + (status === 'connected' ? ' on' : status === 'error' ? ' bad' : '');
  const on = status === 'connected';
  $<HTMLButtonElement>('disc').disabled = !source;
  $<HTMLButtonElement>('rec').disabled = !on || recording;
}

async function connect(src: GloveSource): Promise<void> {
  // Intercept raw samples before GloveInput processes them.
  const origOnSample = src.onSample.bind(src);
  src.onSample = (cb) => origOnSample((s) => { onRaw(s); cb(s); });
  source = src;
  glove.on('status', ({ status, detail }) => setStatus(status, detail));
  try { await glove.attach(src); } catch { /* status already shown */ }
}

function onRaw(s: RawSample): void {
  raw = s; rawCount++;
  rateWindow.push(s.timestamp);
  rateWindow = rateWindow.filter((t) => s.timestamp - t < 1000);
  if (recording) {
    const mask = s.buttons.reduce((m, b, i) => m | (b ? 1 << i : 0), 0);
    recs.push({ t: s.timestamp, roll: s.roll, pitch: s.pitch, yaw: s.yaw, mask });
  }
}

// Button classification events from GloveInput.
for (const type of ['press', 'release', 'tap', 'holdstart', 'holdend'] as const) {
  glove.on(type, ({ button }) => log(`${type} B${button}`));
}

// ---------- UI wiring ----------
$('ble').onclick = () => connect(new BleSource());
$('usb').onclick = () => connect(new SerialSource());
if (!BleSource.supported) { $<HTMLButtonElement>('ble').disabled = true; $('ble').title = 'Web Bluetooth needs Chrome on https:// or localhost'; }
if (!SerialSource.supported) { $<HTMLButtonElement>('usb').disabled = true; $('usb').title = 'Web Serial needs Chrome'; }
$('disc').onclick = () => { glove.detach(); source = null; setStatus('disconnected'); };
$('recenter').onclick = () => { glove.recenter(); if (raw) rawZero = { roll: raw.roll, pitch: raw.pitch, yaw: raw.yaw }; log('recenter'); };

$('rec').onclick = () => {
  recording = true; recStart = now(); recs = []; markers = []; events = [];
  $('recstate').innerHTML = '<span class="rec"></span>recording…';
  $<HTMLButtonElement>('rec').disabled = true; $<HTMLButtonElement>('stop').disabled = false;
  $<HTMLButtonElement>('addmarker').disabled = false;
  document.querySelectorAll<HTMLButtonElement>('.preset').forEach((b) => (b.disabled = false));
  $('markerlist').textContent = '';
  log('recording started');
};
$('stop').onclick = () => {
  recording = false;
  $('recstate').textContent = `stopped · ${recs.length} samples`;
  $<HTMLButtonElement>('rec').disabled = !glove.connected; $<HTMLButtonElement>('stop').disabled = true;
  $<HTMLButtonElement>('addmarker').disabled = true;
  document.querySelectorAll<HTMLButtonElement>('.preset').forEach((b) => (b.disabled = true));
  const report = buildReport();
  $<HTMLTextAreaElement>('report').value = report;
  $<HTMLButtonElement>('copy').disabled = false; $<HTMLButtonElement>('download').disabled = false;
};
function addMarker(label: string): void {
  if (!recording || !label.trim()) return;
  markers.push({ t: now(), label: label.trim() });
  $('markerlist').textContent = markers.map((m) => `${tRel(m.t)}  ${m.label}`).join('\n');
  log(`marker: ${label.trim()}`);
}
$('addmarker').onclick = () => { addMarker($<HTMLInputElement>('marker').value); $<HTMLInputElement>('marker').value = ''; };
$<HTMLInputElement>('marker').onkeydown = (e) => { if (e.key === 'Enter') { addMarker($<HTMLInputElement>('marker').value); $<HTMLInputElement>('marker').value = ''; } };
document.querySelectorAll<HTMLButtonElement>('.preset').forEach((b) => (b.onclick = () => addMarker(b.dataset.l!)));
$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText($<HTMLTextAreaElement>('report').value); $('copied').textContent = 'copied to clipboard'; }
  catch { $<HTMLTextAreaElement>('report').select(); $('copied').textContent = 'select-all + copy manually'; }
  setTimeout(() => ($('copied').textContent = ''), 2000);
};
$('download').onclick = () => {
  const blob = new Blob([$<HTMLTextAreaElement>('report').value], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `aloft-glove-test-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`; a.click();
  URL.revokeObjectURL(a.href);
};

// ---------- live refresh ----------
function refresh(): void {
  if (raw) {
    for (const k of ['roll', 'pitch', 'yaw'] as const) {
      const rv = ((raw[k] - rawZero[k] + 540) % 360) - 180;   // raw minus the recentre offset, wrapped
      $(`raw-${k}`).textContent = fmt(rv) + '°';
      const v = Math.max(-90, Math.min(90, rv)) / 90;
      const bar = $(`bar-${k}`);
      bar.style.left = v < 0 ? `${50 + v * 50}%` : '50%';
      bar.style.width = `${Math.abs(v) * 50}%`;
      $(`app-${k}`).textContent = `${fmt(glove.tilt[k])}° / ${fmt(glove.state[k])}°`;
    }
    raw.buttons.forEach((b, i) => $(`b${i}`).classList.toggle('down', b));
    const age = now() - raw.timestamp;
    $('rate').textContent = `${rateWindow.length} Hz · ${rawCount} samples${age > 1500 ? ' · NO DATA for ' + (age / 1000).toFixed(0) + 's' : ''}`;
    $('rate').className = 'status' + (age > 1500 ? ' bad' : '');
  }
  requestAnimationFrame(refresh);
}
refresh();

// ---------- report ----------
function stats(vals: number[]): string {
  if (!vals.length) return 'n/a';
  const min = Math.min(...vals), max = Math.max(...vals);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
  return `min ${fmt(min)}  max ${fmt(max)}  mean ${fmt(mean)}  sd ${sd.toFixed(2)}  span ${(max - min).toFixed(1)}`;
}
function unwrapYaw(vals: number[]): number[] {
  const out: number[] = []; let off = 0;
  for (let i = 0; i < vals.length; i++) {
    if (i > 0) { const d = vals[i] - vals[i - 1]; if (d > 180) off -= 360; else if (d < -180) off += 360; }
    out.push(vals[i] + off);
  }
  return out;
}
function buildReport(): string {
  const L: string[] = [];
  const dur = recs.length ? (recs[recs.length - 1].t - recs[0].t) / 1000 : 0;
  L.push(`Aloft glove test report  ${new Date().toISOString()}`);
  L.push(`source: ${source?.kind === 'ble' ? source.name : 'none'}   duration: ${dur.toFixed(1)} s   samples: ${recs.length}   avg rate: ${dur ? (recs.length / dur).toFixed(1) : '0'} Hz`);
  let gaps = 0, maxGap = 0;
  for (let i = 1; i < recs.length; i++) { const g = recs[i].t - recs[i - 1].t; if (g > 200) gaps++; if (g > maxGap) maxGap = g; }
  L.push(`gaps >200 ms: ${gaps}   longest gap: ${maxGap.toFixed(0)} ms`);
  L.push(`app config: invertRoll=${INPUT.invertRoll} invertPitch=${INPUT.invertPitch} smoothing=${INPUT.smoothing} deadzone=${INPUT.deadzoneDeg} tapMaxMs=${INPUT.tapMaxMs} FLY.deadzone=${FLY.deadzoneDeg} FLY.fullTilt=${FLY.fullTiltDeg} axisControl=${JSON.stringify(FLY.axisControl)} axisSign=${JSON.stringify(FLY.axisSign)} rotate=${FLY.rotate.style}/${FLY.rotate.turnAxis}/${FLY.rotate.lookAxis}`);
  L.push('');
  L.push('RAW AXES over the whole recording (degrees)');
  L.push(`  roll : ${stats(recs.map((r) => r.roll))}`);
  L.push(`  pitch: ${stats(recs.map((r) => r.pitch))}`);
  L.push(`  yaw  : ${stats(unwrapYaw(recs.map((r) => r.yaw)))}`);
  L.push('');
  // Segments between markers.
  L.push('SEGMENTS (from each marker to the next)');
  const bounds = [{ t: recs[0]?.t ?? recStart, label: '(start)' }, ...markers, { t: recs[recs.length - 1]?.t ?? now(), label: '(end)' }];
  for (let i = 0; i < bounds.length - 1; i++) {
    const a = bounds[i], b = bounds[i + 1];
    const seg = recs.filter((r) => r.t >= a.t && r.t < b.t);
    if (!seg.length) continue;
    const d = (b.t - a.t) / 1000;
    const yawU = unwrapYaw(seg.map((r) => r.yaw));
    const yawDelta = yawU[yawU.length - 1] - yawU[0];
    const rollDelta = seg[seg.length - 1].roll - seg[0].roll;
    const pitchDelta = seg[seg.length - 1].pitch - seg[0].pitch;
    const rollSpan = Math.max(...seg.map((r) => r.roll)) - Math.min(...seg.map((r) => r.roll));
    const pitchSpan = Math.max(...seg.map((r) => r.pitch)) - Math.min(...seg.map((r) => r.pitch));
    const yawSpan = Math.max(...yawU) - Math.min(...yawU);
    const pressed = seg.filter((r) => r.mask).length;
    L.push(`  ${tRel(a.t).padStart(7)}  ${a.label.padEnd(26)} ${d.toFixed(1).padStart(5)} s  roll Δ${fmt(rollDelta).padStart(6)} span ${rollSpan.toFixed(0).padStart(3)}  pitch Δ${fmt(pitchDelta).padStart(6)} span ${pitchSpan.toFixed(0).padStart(3)}  yaw Δ${fmt(yawDelta).padStart(6)} (${fmt(yawDelta / d)}°/s) span ${yawSpan.toFixed(0).padStart(3)}  buttons-down samples ${pressed}`);
  }
  L.push('');
  // Buttons from the raw mask.
  L.push('BUTTONS (from raw bitmask)');
  for (let b = 0; b < 4; b++) {
    const presses: number[] = []; let downAt: number | null = null;
    for (const r of recs) {
      const down = !!(r.mask & (1 << b));
      if (down && downAt === null) downAt = r.t;
      if (!down && downAt !== null) { presses.push(r.t - downAt); downAt = null; }
    }
    if (downAt !== null) presses.push(now() - downAt);
    L.push(`  B${b} (GPIO ${BUTTON_GPIO[b]}): ${presses.length} press${presses.length === 1 ? '' : 'es'}${presses.length ? '  durations ms: ' + presses.map((p) => p.toFixed(0)).join(', ') : ''}`);
  }
  L.push('');
  L.push('EVENTS (app classification)');
  if (!events.length) L.push('  none');
  for (const e of events) L.push(`  ${tRel(e.t).padStart(7)}  ${e.text}`);
  L.push('');
  L.push('TRACE every 0.5 s:  t  roll  pitch  yaw  buttons');
  let nextT = recs[0]?.t ?? 0; let lines = 0;
  for (const r of recs) {
    if (r.t < nextT) continue;
    nextT = r.t + 500;
    const btn = [0, 1, 2, 3].filter((b) => r.mask & (1 << b)).map((b) => 'B' + b).join('+') || '-';
    L.push(`  ${tRel(r.t).padStart(7)}  ${fmt(r.roll).padStart(7)}  ${fmt(r.pitch).padStart(7)}  ${fmt(r.yaw).padStart(7)}  ${btn}`);
    if (++lines >= 300) { L.push('  … (trace truncated at 150 s)'); break; }
  }
  return L.join('\n');
}

// Debug handle so the bench itself can be exercised from the console / automated checks.
(window as unknown as { __aloftTest: unknown }).__aloftTest = { glove, connect, buildReport, get recording() { return recording; } };
