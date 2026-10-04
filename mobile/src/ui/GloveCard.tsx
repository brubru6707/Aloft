import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MODE_COLORS, MODE_ORDER } from '../config';
import { engine, type HudState } from '../core/Engine';
import { applyProfile, cycleRole, OFF, profilesFor, roleShort } from '../input/buttonMap';
import { Chip } from './widgets';
import { FONT, T } from './theme';

/**
 * Split view: one compact settings card per glove, inside that glove's half, so neither glove
 * needs the Glove tab picker. Every control acts on this card's glove.
 */
export function GloveCard({ hud, i, width }: { hud: HudState; i: number; width: number }) {
  const g = hud.gloves[i];
  const act = (fn: () => void) => () => { engine.selectGlove(i); fn(); };
  return (
    <View style={[s.card, { width, borderColor: g.color }]} pointerEvents="box-none">
      <View style={s.row}>
        <Text style={[s.tag, { backgroundColor: g.color }]}>G{i + 1}</Text>
        <Text style={[s.status, g.connected && { color: T.accentHover }]} numberOfLines={1}>{g.label}</Text>
        {!g.connected ? <Chip label="Connect" onPress={act(() => void engine.connectBle())} style={s.small} /> : null}
        <Chip label="Sim" on={g.sourceKind === 'sim'} onPress={act(() => void engine.toggleSimulator())} style={s.small} />
        {g.connected ? <Chip label="Zero" onPress={act(() => engine.recenter())} style={s.small} /> : null}
        {g.sourceKind ? <Chip label="✕" onPress={act(() => engine.disconnect())} style={s.small} /> : null}
      </View>
      <View style={s.row}>
        {MODE_ORDER.map((m, k) => <Chip key={m} label={m} on={g.mode === m} onColor={MODE_COLORS[m]} onPress={act(() => engine.setMode(k))} style={s.small} />)}
      </View>
      <View style={s.row}>
        <Text style={s.v}>V{g.version}</Text>
        {profilesFor(g.version).map((p) => <Chip key={p.id} label={p.name} on={g.profile === p.id} onColor={T.accent} onPress={() => { applyProfile(p.id); engine.toast(`Glove ${i + 1}: ${p.name}`); }} style={s.small} />)}
      </View>
    </View>
  );
}

/** One glove's pins as small boxes along the bottom of its half (like B0–B3): lit while held, tap to change the job. */
export function PinStrip({ hud, i }: { hud: HudState; i: number }) {
  const g = hud.gloves[i];
  return (
    <View style={s.strip} pointerEvents="box-none">
      {g.pinList.map((pin, k) => (
        <Pressable key={pin} onPress={() => cycleRole(g.version, pin)} onLongPress={() => cycleRole(g.version, pin, -1)} style={[s.box, g.roles[k] === OFF && { opacity: 0.45 }, g.pins[k] && s.pinDown]}>
          <Text style={[s.boxNum, g.pins[k] && { color: '#fff' }]}>{pin}</Text>
          <Text style={[s.boxRole, g.pins[k] && { color: '#fff' }]} numberOfLines={1}>{roleShort(g.roles[k]).toLowerCase()}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  strip: { flexDirection: 'row', gap: 2 },
  box: { width: 28, height: 36, borderRadius: T.radius, backgroundColor: 'rgba(40,40,40,0.5)', borderWidth: 1, borderColor: 'rgba(31,31,31,0.6)', alignItems: 'center', justifyContent: 'center' },
  boxNum: { color: T.text, fontWeight: '700', fontSize: 11, lineHeight: 13 },
  boxRole: { color: T.muted, fontSize: 7 },
  card: { position: 'absolute', backgroundColor: 'rgba(40,40,40,0.82)', borderWidth: 1, borderRadius: T.radius, padding: 5, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 3, flexWrap: 'wrap' },
  tag: { fontFamily: FONT.pixel, fontSize: 10, color: '#1d1d1d', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, overflow: 'hidden' },
  status: { flex: 1, color: T.muted, fontSize: 9 },
  small: { paddingVertical: 3, paddingHorizontal: 6 },
  pin: { flex: 1, minWidth: 0, paddingVertical: 2, borderRadius: T.radius, borderWidth: 1, borderColor: T.line, backgroundColor: 'rgba(30,30,30,0.6)', alignItems: 'center' },
  pinDown: { backgroundColor: T.select, borderColor: T.selectBorder },
  pinNum: { color: T.text, fontWeight: '700', fontSize: 10 },
  pinRole: { color: T.muted, fontSize: 7 },
  v: { color: T.muted, fontSize: 9, marginRight: 2 },
});
