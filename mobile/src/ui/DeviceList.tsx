import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BUILD, MODE_COLORS } from '../config';
import { engine, shapeLabel, type HudState } from '../core/Engine';
import { T } from './theme';

/**
 * Device list: a slim, scrollable column of kit parts on the left edge, only in BUILD / ERASE.
 * Names only (no thumbnails on the phone). Tap = build with it (the ERASE eraser takes the same shape).
 * Tap the header to fold it; "X2D, show me the devices" unfolds it.
 */
export function DeviceList({ hud, top, left, maxHeight }: { hud: HudState; top: number; left: number; maxHeight: number }) {
  if (hud.mode !== 'BUILD' && hud.mode !== 'ERASE') return null;
  const on = MODE_COLORS[hud.mode];
  return (
    <View style={[s.wrap, { top, left, maxHeight }]}>
      <Pressable onPress={() => engine.showDevices(!hud.devicesOpen)} style={s.head} hitSlop={4}>
        <Text style={s.headText}>DEVICES</Text>
        <Text style={s.fold}>{hud.devicesOpen ? '▾' : '▸'}</Text>
      </Pressable>
      {hud.devicesOpen ? (
        <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
          {BUILD.devices.map((p) => (
            <Pressable key={p} onPress={() => engine.setPrimitive(p)} style={({ pressed }) => [s.item, hud.primitive === p && { borderColor: on, backgroundColor: T.panel2 }, pressed && { opacity: 0.7 }]}>
              <Text style={[s.itemText, hud.primitive === p && { color: on }]} numberOfLines={1}>{shapeLabel(p)}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', width: 92, backgroundColor: 'rgba(40,40,40,0.72)', borderWidth: 1, borderColor: T.line, borderRadius: T.radius, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 6 },
  headText: { color: T.muted, fontSize: 9, letterSpacing: 1, fontWeight: '600' },
  fold: { marginLeft: 'auto', color: T.text, fontSize: 10 },
  list: { padding: 3, gap: 2 },
  item: { paddingVertical: 5, paddingHorizontal: 5, borderRadius: T.radius, borderWidth: 1, borderColor: 'transparent' },
  itemText: { color: T.text, fontSize: 10, fontWeight: '500' },
});
