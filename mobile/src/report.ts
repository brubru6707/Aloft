import { FLY, INPUT, TEST } from './config';
import { ROLES } from './input/buttonMap';

/** One raw sample as recorded by the Test screen. */
export interface Rec { t: number; roll: number; pitch: number; yaw: number; mask: number }
export interface Marker { t: number; label: string }
export interface Ev { t: number; text: string }

export interface Recording {
  recStart: number;
  recs: Rec[];
  markers: Marker[];
  events: Ev[];
  sourceName: string;   // 'none' when no BLE source
  now: number;          // performance.now() at report time
}

const fmt = (v: number, d = 1) => (v >= 0 ? '+' : '') + v.toFixed(d);

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

/** Same sections as the web test bench: stats, per-marker segments, button presses, events, 0.5 s trace. */
export function buildReport(r: Recording): string {
  const { recs, markers, events, recStart, now } = r;
  const tRel = (t: number) => ((t - recStart) / 1000).toFixed(2) + 's';
  const L: string[] = [];
  const dur = recs.length ? (recs[recs.length - 1].t - recs[0].t) / 1000 : 0;
  L.push(`Aloft glove test report  ${new Date().toISOString()}`);
  L.push(`source: ${r.sourceName}   duration: ${dur.toFixed(1)} s   samples: ${recs.length}   avg rate: ${dur ? (recs.length / dur).toFixed(1) : '0'} Hz`);
  let gaps = 0, maxGap = 0;
  for (let i = 1; i < recs.length; i++) { const g = recs[i].t - recs[i - 1].t; if (g > TEST.gapMs) gaps++; if (g > maxGap) maxGap = g; }
  L.push(`gaps >${TEST.gapMs} ms: ${gaps}   longest gap: ${maxGap.toFixed(0)} ms`);
  L.push(`app config: invertRoll=${INPUT.invertRoll} invertPitch=${INPUT.invertPitch} smoothing=${INPUT.smoothing} deadzone=${INPUT.deadzoneDeg} tapMaxMs=${INPUT.tapMaxMs} FLY.deadzone=${FLY.deadzoneDeg} FLY.fullTilt=${FLY.fullTiltDeg} axisControl=${JSON.stringify(FLY.axisControl)} axisSign=${JSON.stringify(FLY.axisSign)} rotate=${FLY.rotate.style}/${FLY.rotate.turnAxis}/${FLY.rotate.lookAxis}`);
  L.push('');
  L.push('RAW AXES over the whole recording (degrees)');
  L.push(`  roll : ${stats(recs.map((x) => x.roll))}`);
  L.push(`  pitch: ${stats(recs.map((x) => x.pitch))}`);
  L.push(`  yaw  : ${stats(unwrapYaw(recs.map((x) => x.yaw)))}`);
  L.push('');
  // Segments between markers.
  L.push('SEGMENTS (from each marker to the next)');
  const bounds = [{ t: recs[0]?.t ?? recStart, label: '(start)' }, ...markers, { t: recs[recs.length - 1]?.t ?? now, label: '(end)' }];
  for (let i = 0; i < bounds.length - 1; i++) {
    const a = bounds[i], b = bounds[i + 1];
    const seg = recs.filter((x) => x.t >= a.t && x.t < b.t);
    if (!seg.length) continue;
    const d = (b.t - a.t) / 1000;
    const yawU = unwrapYaw(seg.map((x) => x.yaw));
    const yawDelta = yawU[yawU.length - 1] - yawU[0];
    const rollDelta = seg[seg.length - 1].roll - seg[0].roll;
    const pitchDelta = seg[seg.length - 1].pitch - seg[0].pitch;
    const rollSpan = Math.max(...seg.map((x) => x.roll)) - Math.min(...seg.map((x) => x.roll));
    const pitchSpan = Math.max(...seg.map((x) => x.pitch)) - Math.min(...seg.map((x) => x.pitch));
    const yawSpan = Math.max(...yawU) - Math.min(...yawU);
    const pressed = seg.filter((x) => x.mask).length;
    L.push(`  ${tRel(a.t).padStart(7)}  ${a.label.padEnd(26)} ${d.toFixed(1).padStart(5)} s  roll Δ${fmt(rollDelta).padStart(6)} span ${rollSpan.toFixed(0).padStart(3)}  pitch Δ${fmt(pitchDelta).padStart(6)} span ${pitchSpan.toFixed(0).padStart(3)}  yaw Δ${fmt(yawDelta).padStart(6)} (${fmt(yawDelta / d)}°/s) span ${yawSpan.toFixed(0).padStart(3)}  buttons-down samples ${pressed}`);
  }
  L.push('');
  // Buttons from the raw mask.
  L.push('BUTTONS (from raw bitmask)');
  for (let b = 0; b < ROLES.length; b++) {
    const presses: number[] = []; let downAt: number | null = null;
    for (const x of recs) {
      const down = !!(x.mask & (1 << b));
      if (down && downAt === null) downAt = x.t;
      if (!down && downAt !== null) { presses.push(x.t - downAt); downAt = null; }
    }
    if (downAt !== null) presses.push(now - downAt);
    L.push(`  ${ROLES[b]?.short ?? 'B' + b} (job ${b}): ${presses.length} press${presses.length === 1 ? '' : 'es'}${presses.length ? '  durations ms: ' + presses.map((p) => p.toFixed(0)).join(', ') : ''}`);
  }
  L.push('');
  L.push('EVENTS (app classification)');
  if (!events.length) L.push('  none');
  for (const e of events) L.push(`  ${tRel(e.t).padStart(7)}  ${e.text}`);
  L.push('');
  L.push(`TRACE every ${(TEST.traceEveryMs / 1000).toFixed(1)} s:  t  roll  pitch  yaw  buttons`);
  let nextT = recs[0]?.t ?? 0; let lines = 0;
  for (const x of recs) {
    if (x.t < nextT) continue;
    nextT = x.t + TEST.traceEveryMs;
    const btn = [0, 1, 2, 3].filter((b) => x.mask & (1 << b)).map((b) => 'B' + b).join('+') || '-';
    L.push(`  ${tRel(x.t).padStart(7)}  ${fmt(x.roll).padStart(7)}  ${fmt(x.pitch).padStart(7)}  ${fmt(x.yaw).padStart(7)}  ${btn}`);
    if (++lines >= TEST.traceMaxLines) { L.push(`  … (trace truncated at ${(TEST.traceMaxLines * TEST.traceEveryMs / 1000).toFixed(0)} s)`); break; }
  }
  return L.join('\n');
}
