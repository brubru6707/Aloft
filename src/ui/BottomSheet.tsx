import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { engine, type HudState } from '../core/Engine';
import { BUILD, MODE_COLORS, MODE_ORDER, type FlyAxis } from '../config';
import { Btn, Chip, Readout, SignedBar, fmtDeg } from './widgets';
import { FONT, T } from './theme';

const FLY_CHIPS: { label: string; axis: FlyAxis | null }[] = [
  { label: 'ROTATE', axis: null }, { label: 'X', axis: 'X' }, { label: 'Y', axis: 'Y' }, { label: 'Z', axis: 'Z' },
];
type Tab = 'glove' | 'build' | 'tools';
const TABS: { id: Tab; label: string }[] = [{ id: 'glove', label: 'Glove' }, { id: 'build', label: 'Build' }, { id: 'tools', label: 'Tools' }];
const VOICE_ICON = { off: '🎙', listening: '🎙', connecting: '…', talking: '🔴', unsupported: '🎙' } as const;

/** Top bar: the mode chips and the X2D mic, right under the status bar (out of the way of the 3D view). */
export function TopModes({ hud, top, right }: { hud: HudState; top: number; right: number }) {
  const voiceOn = hud.voiceState === 'talking' || hud.voiceState === 'connecting';
  return (
    <View style={[s.top, { top, right }]} pointerEvents="box-none">
      {MODE_ORDER.map((m, i) => <Chip key={m} flex label={m} on={hud.mode === m} onColor={MODE_COLORS[m]} onPress={() => engine.setMode(i)} style={s.modeChip} />)}
      <Pressable onPress={() => engine.toggleVoice()} disabled={hud.voiceState === 'unsupported'} style={({ pressed }) => [s.mic, voiceOn && s.micOn, pressed && { opacity: 0.7 }]}>
        <Text style={s.micText}>{VOICE_ICON[hud.voiceState]}</Text>
      </Pressable>
    </View>
  );
}

/**
 * Bottom dock. Always visible: three tabs (the mode chips and the X2D mic are in TopModes at the top). Tapping a tab
 * opens just that panel above the dock (tap it again to close), so the 3D view keeps most
 * of the screen and nothing stacks.
 *  - Glove: connection, live roll/pitch/yaw, B0–B3
 *  - Build: FLY state + move bar (FLY), SHAPE / SIZE (BUILD), rotate style, sensitivity
 *  - Tools: undo, export STL, ask Gemini
 */
export function BottomSheet({ hud, bottomInset, onExport, landscape }: { hud: HudState; bottomInset: number; onExport: () => void; landscape: boolean }) {
  const [tab, setTab] = useState<Tab | null>(null);
  const [question, setQuestion] = useState('');
  const ask = () => { const q = question.trim(); if (!q) return; setQuestion(''); void engine.askAssistant(q); };
  const statusOn = hud.connected && !hud.stale;
  const activeFly = hud.flyLabel === '' ? -1 : hud.flyAxis ? ['X', 'Y', 'Z'].indexOf(hud.flyAxis) + 1 : 0;

  return (
    <View style={[s.wrap, landscape ? s.wrapLandscape : s.wrapPortrait, { paddingBottom: bottomInset + 6 }]} pointerEvents="box-none">
      {tab ? (
        <View style={s.panel}>
          <ScrollView style={{ maxHeight: landscape ? 150 : 170 }} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
            {tab === 'glove' ? (
              <>
                <View style={s.row}>
                  <View style={[s.dot, { backgroundColor: statusOn ? T.accentHover : T.muted }]} />
                  <Text style={[s.status, statusOn && { color: T.accentHover }, hud.status === 'error' && { color: T.bad }]} numberOfLines={1}>{hud.statusLabel}</Text>
                  <Text style={s.note}>B2 = reset</Text>
                </View>
                <View style={s.row}>
                  <Btn small style={s.grow} label={hud.status === 'connecting' && hud.sourceKind === 'ble' ? 'Connecting…' : 'Connect'} active={hud.sourceKind === 'ble' && hud.connected} onPress={() => engine.connectBle()} />
                  <Btn small style={s.grow} label="Simulator" active={hud.sourceKind === 'sim'} onPress={() => engine.toggleSimulator()} />
                  <Btn small style={s.grow} label="Recenter" onPress={() => engine.recenter()} />
                  {hud.sourceKind ? <Btn small label="✕" onPress={() => engine.disconnect()} /> : null}
                </View>
                <View style={s.row}>
                  <Readout label="ROLL" value={fmtDeg(hud.roll)} />
                  <Readout label="PITCH" value={fmtDeg(hud.pitch)} />
                  <Readout label="YAW" value={fmtDeg(hud.yaw)} />
                </View>
              </>
            ) : null}

            {tab === 'build' ? (
              <>
                {hud.mode === 'FLY' ? (
                  <View style={s.row}>
                    <Text style={s.rowLabel}>FLY</Text>
                    {FLY_CHIPS.map((c, i) => <Chip key={c.label} label={c.label} on={activeFly === i} onPress={() => engine.setFlyAxis(c.axis)} />)}
                    <SignedBar value={hud.deflection} />
                  </View>
                ) : null}
                {hud.mode === 'BUILD' ? (
                  <>
                    <View style={s.row}>
                      <Text style={s.rowLabel}>SHAPE</Text>
                      {BUILD.primitives.map((p) => <Chip key={p} flex label={p} on={hud.primitive === p} onColor={MODE_COLORS.BUILD} onPress={() => engine.setPrimitive(p)} />)}
                    </View>
                    <View style={s.row}>
                      <Text style={s.rowLabel}>SIZE</Text>
                      {BUILD.sizes.map((z) => <Chip key={z} label={z[0].toUpperCase()} on={hud.size === z} onColor={MODE_COLORS.BUILD} onPress={() => engine.setSize(z)} />)}
                      <Text style={s.pos} numberOfLines={1}>{hud.ghostInfo}</Text>
                    </View>
                  </>
                ) : null}
                {hud.mode !== 'FLY' && hud.mode !== 'BUILD' ? <Text style={s.note}>{hud.mode}: tilt the glove · B1 acts on the piece under the crosshair</Text> : null}
                <View style={s.row}>
                  <Btn small style={s.grow} label={hud.rotateStyle === 'absolute' ? '⟳ Rotate: absolute' : '⟳ Rotate: rate'} active={hud.rotateStyle === 'absolute'} onPress={() => engine.toggleRotateStyle()} />
                  <Btn small style={s.grow} label={`⚡ Sens ${hud.sensitivity}×`} active={hud.sensitivity !== 1} onPress={() => engine.cycleSensitivity()} />
                </View>
              </>
            ) : null}

            {tab === 'tools' ? (
              <>
                <View style={s.row}>
                  <Btn small style={s.grow} label={`↶ Undo${hud.undoSize ? ` (${hud.undoSize})` : ''}`} onPress={() => engine.doUndo()} />
                  <Btn small style={s.grow} label="⬇ Export STL" onPress={onExport} />
                </View>
                <View style={s.row}>
                  <TextInput
                    style={s.ask}
                    value={question}
                    onChangeText={setQuestion}
                    placeholder={hud.geminiAvailable ? '✨ Ask Gemini…' : '✨ Gemini key missing (.env.local)'}
                    placeholderTextColor={T.muted}
                    returnKeyType="send"
                    onSubmitEditing={ask}
                    blurOnSubmit
                  />
                  <Btn small label="Ask" accent disabled={!question.trim()} onPress={ask} />
                </View>
              </>
            ) : null}
          </ScrollView>
        </View>
      ) : null}

      <View style={s.dock}>
        <View style={s.tabs}>
          {TABS.map((t) => (
            <Pressable key={t.id} onPress={() => setTab((cur) => (cur === t.id ? null : t.id))} style={[s.tab, tab === t.id && s.tabOn]} hitSlop={4}>
              <Text style={[s.tabText, tab === t.id && s.tabTextOn]}>{t.label}{t.id === 'glove' ? (statusOn ? ' ●' : ' ○') : ''}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', bottom: 0, gap: 5, paddingHorizontal: 8 },
  wrapPortrait: { left: 0, right: 0 },
  wrapLandscape: { right: 0, width: 420 },
  panel: { backgroundColor: 'rgba(40,40,40,0.82)', borderWidth: 1, borderColor: T.line, borderRadius: T.radius },
  body: { padding: 8, gap: 6 },
  dock: { backgroundColor: 'rgba(40,40,40,0.6)', borderWidth: 1, borderColor: 'rgba(31,31,31,0.6)', borderRadius: T.radius, padding: 4, gap: 4 },
  top: { position: 'absolute', left: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  grow: { flex: 1 },
  modeChip: { paddingVertical: 5 },
  mic: { width: 36, height: 26, borderRadius: T.radius, borderWidth: 1, borderColor: T.line, backgroundColor: T.btn, alignItems: 'center', justifyContent: 'center', marginLeft: 2 },
  micOn: { backgroundColor: T.select, borderColor: T.selectBorder },
  micText: { fontSize: 14 },
  tabs: { flexDirection: 'row', gap: 4 },
  tab: { flex: 1, paddingVertical: 4, borderRadius: T.radius, alignItems: 'center', backgroundColor: 'rgba(48,48,48,0.7)', borderWidth: 1, borderColor: T.line },
  tabOn: { backgroundColor: T.btn, borderColor: T.accent },
  tabText: { color: T.muted, fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },
  tabTextOn: { color: T.text },
  dot: { width: 10, height: 10, borderRadius: 2 },
  status: { flex: 1, color: T.muted, fontSize: 12 },
  rowLabel: { color: T.muted, fontSize: 11, letterSpacing: 1, marginRight: 2, minWidth: 40 },
  pos: { marginLeft: 'auto', color: T.muted, fontSize: 10, fontWeight: '500', fontVariant: ['tabular-nums'] },
  note: { color: T.muted, fontSize: 12 },
  ask: { flex: 1, backgroundColor: T.panel2, color: T.text, borderWidth: 1, borderColor: T.line, borderRadius: T.radius, paddingVertical: 7, paddingHorizontal: 10, fontSize: 13 },
});
