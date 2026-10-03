import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { engine, type HudState } from '../core/Engine';
import { BUILD, MODE_COLORS, MODE_ORDER, type FlyAxis } from '../config';
import { Btn, ButtonLamp, Chip, Readout, SignedBar, fmtDeg } from './widgets';
import { FONT, T } from './theme';

const FLY_CHIPS: { label: string; axis: FlyAxis | null }[] = [
  { label: 'ROTATE', axis: null }, { label: 'X', axis: 'X' }, { label: 'Y', axis: 'Y' }, { label: 'Z', axis: 'Z' },
];

/**
 * Collapsible, thumb-reachable glove panel (replaces the web's side panels).
 * The handle row is always visible; tap it to expand or collapse.
 */
export function BottomSheet({ hud, bottomInset, onExport, landscape }: { hud: HudState; bottomInset: number; onExport: () => void; landscape: boolean }) {
  const [open, setOpen] = useState(true);
  const statusOn = hud.connected && !hud.stale;
  const activeFly = hud.flyLabel === '' ? -1 : hud.flyAxis ? ['X', 'Y', 'Z'].indexOf(hud.flyAxis) + 1 : 0;

  return (
    <View style={[s.sheet, landscape ? s.sheetLandscape : s.sheetPortrait, { paddingBottom: bottomInset + 8 }]}>
      <Pressable onPress={() => setOpen((o) => !o)} style={s.handleRow} hitSlop={6}>
        <View style={s.handle} />
        <View style={s.handleInfo}>
          <View style={[s.dot, { backgroundColor: statusOn ? T.accentHover : T.muted }]} />
          <Text style={s.name}>Glove</Text>
          <Text style={[s.status, statusOn && { color: T.accentHover }, hud.status === 'error' && { color: T.bad }]} numberOfLines={1}>{hud.statusLabel}</Text>
          <Text style={s.chev}>{open ? '▾' : '▴'}</Text>
        </View>
      </Pressable>

      {open ? (
        <ScrollView style={landscape ? { maxHeight: 300 } : undefined} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <View style={s.row}>
            <Btn small style={s.grow} label={hud.status === 'connecting' && hud.sourceKind === 'ble' ? 'Connecting…' : 'Connect Glove'} active={hud.sourceKind === 'ble' && hud.connected} onPress={() => engine.connectBle()} />
            <Btn small style={s.grow} label="Simulator" active={hud.sourceKind === 'sim'} onPress={() => engine.toggleSimulator()} />
            <Btn small style={s.grow} label="Recenter" onPress={() => engine.recenter()} />
            {hud.sourceKind ? <Btn small label="✕" onPress={() => engine.disconnect()} /> : null}
          </View>

          <View style={s.row}>
            <Readout label="ROLL" value={fmtDeg(hud.roll)} />
            <Readout label="PITCH" value={fmtDeg(hud.pitch)} />
            <Readout label="YAW" value={fmtDeg(hud.yaw)} />
          </View>

          <View style={s.row}>
            {hud.buttons.map((b, i) => <ButtonLamp key={i} label={`B${i}`} down={b} />)}
          </View>

          {/* Mode chips: tap = jump to that mode (also the only way to go to the previous mode). */}
          <View style={s.row}>
            {MODE_ORDER.map((m, i) => (
              <Chip key={m} flex label={m} on={hud.mode === m} onColor={MODE_COLORS[m]} onPress={() => engine.setMode(i)} />
            ))}
          </View>

          {hud.mode === 'FLY' ? (
            <View style={s.row}>
              <Text style={s.rowLabel}>FLY</Text>
              {FLY_CHIPS.map((c, i) => (
                <Chip key={c.label} label={c.label} on={activeFly === i} onPress={() => engine.setFlyAxis(c.axis)} />
              ))}
              <SignedBar value={hud.deflection} />
            </View>
          ) : null}

          {hud.mode === 'BUILD' ? (
            <View style={[s.row, { flexWrap: 'wrap' }]}>
              <Text style={s.rowLabel}>SHAPE</Text>
              {BUILD.primitives.map((p) => (
                <Chip key={p} label={p} on={hud.primitive === p} onColor={MODE_COLORS.BUILD} onPress={() => engine.setPrimitive(p)} />
              ))}
              <Text style={[s.rowLabel, { marginLeft: 6 }]}>SIZE</Text>
              {BUILD.sizes.map((z) => (
                <Chip key={z} label={z[0].toUpperCase()} on={hud.size === z} onColor={MODE_COLORS.BUILD} onPress={() => engine.setSize(z)} />
              ))}
              <Text style={s.pos} numberOfLines={1}>{hud.ghostInfo}</Text>
            </View>
          ) : null}

          <View style={s.row}>
            <Btn small style={s.grow} label={hud.rotateStyle === 'absolute' ? '⟳ Rotate: absolute' : '⟳ Rotate: rate'} active={hud.rotateStyle === 'absolute'} onPress={() => engine.toggleRotateStyle()} />
            <Btn small style={s.grow} label={`⚡ Sens: ${hud.sensitivity}×`} active={hud.sensitivity !== 1} onPress={() => engine.cycleSensitivity()} />
          </View>
          <View style={s.row}>
            <Btn small style={s.grow} label={`↶ Undo${hud.undoSize ? ` (${hud.undoSize})` : ''}`} onPress={() => engine.doUndo()} />
            <Btn small style={s.grow} label="⬇ Export STL" onPress={onExport} />
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  sheet: {
    position: 'absolute', bottom: 0,
    backgroundColor: 'rgba(40,40,40,0.94)', borderTopWidth: 1, borderColor: T.line,
    borderTopLeftRadius: T.radius, borderTopRightRadius: T.radius,
  },
  sheetPortrait: { left: 0, right: 0 },
  sheetLandscape: { right: 0, width: 400, borderLeftWidth: 1, borderTopRightRadius: 0 },
  handleRow: { alignItems: 'center', paddingTop: 6, paddingBottom: 6, paddingHorizontal: 12 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: T.lineSoft, marginBottom: 6 },
  handleInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch' },
  dot: { width: 10, height: 10, borderRadius: 2 },
  name: { color: T.text, fontFamily: FONT.pixel, fontSize: 15 },
  status: { flex: 1, color: T.muted, fontSize: 12 },
  chev: { color: T.muted, fontSize: 14 },
  body: { paddingHorizontal: 12, paddingBottom: 4, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  grow: { flex: 1 },
  rowLabel: { color: T.muted, fontSize: 11, letterSpacing: 1, marginRight: 2 },
  pos: { marginLeft: 'auto', color: T.muted, fontSize: 10, fontWeight: '500', fontVariant: ['tabular-nums'] },
});
