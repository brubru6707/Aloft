import * as Clipboard from 'expo-clipboard';
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { engine } from '../core/Engine';
import { useHud } from '../core/useHud';
import { BUTTON_GPIO, TEST, UI } from '../config';
import type { RawSample } from '../input/types';
import { shareText } from '../export';
import { buildReport, type Ev, type Marker, type Rec } from '../report';
import { FONT, T } from '../ui/theme';
import { Btn, ButtonLamp, H2, Panel, Readout, SignedBar, fmt1 } from '../ui/widgets';

const now = () => performance.now();

/**
 * Glove test bench (mirrors the web /test.html). No 3D: live raw + processed values, button chips
 * with GPIO labels, recording with markers, event log, and a pasteable / shareable report.
 */
export function TestScreen({ tabBarHeight }: { tabBarHeight: number }) {
  const hud = useHud();
  const insets = useSafeAreaInsets();
  const glove = engine.glove;

  // Mutable recording state lives in refs; a 20 Hz tick mirrors what the UI needs into state.
  const raw = useRef<RawSample | null>(null);
  const rawCount = useRef(0);
  const rateWindow = useRef<number[]>([]);
  const recording = useRef(false);
  const recStart = useRef(0);
  const recs = useRef<Rec[]>([]);
  const markers = useRef<Marker[]>([]);
  const events = useRef<Ev[]>([]);
  const logLines = useRef<string[]>([]);

  const [, setTick] = useState(0);
  const [isRec, setIsRec] = useState(false);
  const [report, setReport] = useState('');
  const [markerText, setMarkerText] = useState('');
  const [copied, setCopied] = useState('');
  const [sampleCount, setSampleCount] = useState<number | null>(null);

  const tRel = (t: number) => ((t - recStart.current) / 1000).toFixed(2) + 's';
  const log = (text: string) => {
    const line = `${recording.current ? tRel(now()) : '--'} ${text}`;
    logLines.current.push(line);
    if (logLines.current.length > TEST.logLines) logLines.current.shift();
    if (recording.current) events.current.push({ t: now(), text });
  };

  useEffect(() => {
    const offs = [
      glove.on('raw', (s) => {
        raw.current = s; rawCount.current++;
        rateWindow.current.push(s.timestamp);
        rateWindow.current = rateWindow.current.filter((t) => s.timestamp - t < 1000);
        if (recording.current) {
          const mask = s.buttons.reduce((m, b, i) => m | (b ? 1 << i : 0), 0);
          recs.current.push({ t: s.timestamp, roll: s.roll, pitch: s.pitch, yaw: s.yaw, mask });
        }
      }),
      ...(['press', 'release', 'tap', 'holdstart', 'holdend'] as const).map((type) => glove.on(type, ({ button }) => log(`${type} B${button}`))),
    ];
    const timer = setInterval(() => setTick((t) => t + 1), 1000 / UI.hudRefreshHz);
    return () => { offs.forEach((off) => off()); clearInterval(timer); };
  }, []);

  const start = () => {
    recording.current = true; recStart.current = now(); recs.current = []; markers.current = []; events.current = [];
    setIsRec(true); setSampleCount(null); log('recording started');
  };
  const stop = () => {
    recording.current = false; setIsRec(false);
    setSampleCount(recs.current.length);
    setReport(buildReport({
      recStart: recStart.current, recs: recs.current, markers: markers.current, events: events.current,
      sourceName: glove.sourceKind === 'ble' ? glove.source?.name ?? 'BLE Glove' : glove.sourceKind === 'sim' ? 'simulator' : 'none',
      now: now(),
    }));
  };
  const addMarker = (label: string) => {
    if (!recording.current || !label.trim()) return;
    markers.current.push({ t: now(), label: label.trim() });
    log(`marker: ${label.trim()}`);
    setMarkerText('');
  };
  const copy = async () => {
    try { await Clipboard.setStringAsync(report); setCopied('copied to clipboard'); } catch { setCopied('copy failed'); }
    setTimeout(() => setCopied(''), 2000);
  };
  const share = async () => {
    try { await shareText(report, `aloft-glove-test-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`); } catch (e) { setCopied(`share failed: ${e instanceof Error ? e.message : String(e)}`); }
  };

  const r = raw.current;
  const age = r ? now() - r.timestamp : 0;
  const noData = !!r && age > 1500;
  const rate = r ? `${rateWindow.current.length} Hz · ${rawCount.current} samples${noData ? ' · NO DATA for ' + (age / 1000).toFixed(0) + 's' : ''}` : '';
  const statusColor = hud.status === 'connected' ? T.ok : hud.status === 'error' ? T.bad : T.muted;

  return (
    <ScrollView style={s.root} contentContainerStyle={[s.content, { paddingTop: insets.top + 12, paddingBottom: tabBarHeight + 20, paddingLeft: 52 }]} keyboardShouldPersistTaps="handled">
      <Text style={s.h1}>Aloft glove test <Text style={s.h1small}>live values, recording, pasteable report</Text></Text>
      <Text style={s.hint}>Connect, press Start recording, do each movement while tapping its marker, press Stop, then Copy or Share the report.</Text>

      <Panel>
        <H2>Connection</H2>
        <View style={s.row}>
          <Btn accent label={hud.status === 'connecting' && hud.sourceKind === 'ble' ? 'Connecting…' : 'Connect BLE'} onPress={() => engine.connectBle()} />
          <Btn label="Simulator" active={hud.sourceKind === 'sim'} onPress={() => engine.toggleSimulator()} />
          <Btn label="Disconnect" disabled={!hud.sourceKind} onPress={() => engine.disconnect()} />
          <Btn label="Recenter" onPress={() => { glove.recenter(); log('recenter'); }} />
        </View>
        <Text style={[s.status, { color: statusColor }]}>{hud.status === 'connected' ? `connected · ${hud.statusLabel}` : hud.statusLabel}</Text>
        {rate ? <Text style={[s.status, noData && { color: T.bad }]}>{rate}</Text> : null}
      </Panel>

      <Panel>
        <H2>Live · raw from glove</H2>
        <View style={s.row}>
          {(['roll', 'pitch', 'yaw'] as const).map((k) => (
            <Readout key={k} label={k.toUpperCase()} value={r ? fmt1(r[k]) + '°' : '—'} big>
              <SignedBar value={r ? Math.max(-90, Math.min(90, r[k])) / 90 : 0} height={6} style={{ marginTop: 6, flex: 0 }} />
            </Readout>
          ))}
        </View>
        <H2 style={{ marginTop: 14 }}>Live · as the app sees it (tilt / state)</H2>
        <View style={s.row}>
          {(['roll', 'pitch', 'yaw'] as const).map((k) => (
            <Readout key={k} label={`${k.toUpperCase()} tilt / state`} value={r ? `${fmt1(glove.tilt[k])}° / ${fmt1(glove.state[k])}°` : '—'} />
          ))}
        </View>
        <H2 style={{ marginTop: 14 }}>Buttons</H2>
        <View style={s.row}>
          {[0, 1, 2, 3].map((b) => <ButtonLamp key={b} label={`B${b}`} sub={`GPIO ${BUTTON_GPIO[b]}`} down={!!r?.buttons[b]} onColor={T.ok} textOn={T.darkText} />)}
        </View>
      </Panel>

      <Panel>
        <H2>Recording</H2>
        <View style={s.row}>
          <Btn accent label="Start recording" disabled={!hud.connected || isRec} onPress={start} />
          <Btn danger label="Stop" disabled={!isRec} onPress={stop} />
          <Text style={s.status}>{isRec ? '● recording…' : sampleCount !== null ? `stopped · ${sampleCount} samples` : ''}</Text>
        </View>
        <View style={[s.row, { marginTop: 10 }]}>
          <TextInput
            style={s.input}
            value={markerText}
            onChangeText={setMarkerText}
            placeholder="marker label, e.g. turning hand left slowly"
            placeholderTextColor={T.muted}
            onSubmitEditing={() => addMarker(markerText)}
            editable={isRec}
          />
          <Btn label="Add marker" disabled={!isRec} onPress={() => addMarker(markerText)} />
        </View>
        <Text style={[s.hint, { marginTop: 8 }]}>or tap a preset:</Text>
        <View style={[s.row, { marginTop: 6 }]}>
          {TEST.presets.map((p) => <Btn key={p} small label={p} disabled={!isRec} onPress={() => addMarker(p)} />)}
        </View>
        {markers.current.length ? <Text style={[s.log, { marginTop: 8 }]}>{markers.current.map((m) => `${tRel(m.t)}  ${m.label}`).join('\n')}</Text> : null}
      </Panel>

      <Panel>
        <H2>Event log (what the app classifies)</H2>
        <Text style={s.log}>{logLines.current.length ? logLines.current.slice().reverse().join('\n') : '—'}</Text>
      </Panel>

      <Panel>
        <H2>Report</H2>
        <View style={s.row}>
          <Btn label="Copy report" disabled={!report} onPress={copy} />
          <Btn label="Share…" disabled={!report} onPress={share} />
          <Text style={s.status}>{copied}</Text>
        </View>
        <ScrollView horizontal style={s.reportBox} nestedScrollEnabled>
          <Text style={s.report} selectable>{report || 'Stop a recording to generate the report.'}</Text>
        </ScrollView>
      </Panel>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  content: { paddingHorizontal: 14 },
  h1: { color: T.text, fontFamily: FONT.pixel, fontSize: 20 },
  h1small: { color: T.muted, fontSize: 13 },
  hint: { color: T.muted, fontSize: 12, marginTop: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  status: { color: T.muted, fontSize: 12, marginTop: 6 },
  input: { flex: 1, minWidth: 160, backgroundColor: T.panel2, color: T.text, borderWidth: 1, borderColor: T.line, borderRadius: T.radius, paddingVertical: 8, paddingHorizontal: 10, fontSize: 13 },
  log: { color: T.muted, fontFamily: 'Menlo', fontSize: 11, lineHeight: 15, maxHeight: 140 },
  reportBox: { marginTop: 8, maxHeight: 320, backgroundColor: T.panel2, borderWidth: 1, borderColor: T.line, borderRadius: T.radius, padding: 10 },
  report: { color: T.text, fontFamily: 'Menlo', fontSize: 11, lineHeight: 14 },
});
