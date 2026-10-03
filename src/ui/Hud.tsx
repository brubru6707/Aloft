import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { HudState } from '../core/Engine';
import { FONT, T, hardShadow } from './theme';

/** Top-left overlay: mode name in the mode colour, one-line hint, FLY state label. */
export function ModeLabel({ hud, compact }: { hud: HudState; compact?: boolean }) {
  // Mode name and FLY state on one line; the hint is a single small line under them.
  return (
    <View style={[s.modes, compact && { right: 130 }]} pointerEvents="none">
      <View style={s.modeRow}>
        <Text style={[s.modeName, { color: hud.modeColor }]}>{hud.mode}</Text>
        {hud.flyLabel ? <Text style={s.axisLabel}>{hud.flyLabel}</Text> : null}
      </View>
      <Text style={s.hint} numberOfLines={1}>{hud.hint}</Text>
    </View>
  );
}

/** Centre crosshair = the glove's cursor. */
export function Crosshair({ hover }: { hover: boolean }) {
  return (
    <View style={s.crossWrap} pointerEvents="none">
      <View style={[s.cross, hover && { transform: [{ scale: 1.35 }] }]}>
        <View style={s.crossDot} />
      </View>
    </View>
  );
}

export function Toast({ text, top }: { text: string; top: number }) {
  if (!text) return null;
  return (
    <View style={[s.toastWrap, { top }]} pointerEvents="none">
      <View style={s.toast}><Text style={s.toastText} numberOfLines={6}>{text}</Text></View>
    </View>
  );
}

const s = StyleSheet.create({
  modes: { position: 'absolute', left: 14, top: 0, right: 130 },
  modeRow: { flexDirection: 'row', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' },
  modeName: { fontFamily: FONT.pixel, fontSize: 34, letterSpacing: 1.5, lineHeight: 38, ...hardShadow(2, 0.55) },
  hint: { fontSize: 11, color: T.muted, marginTop: 2, ...hardShadow(1, 0.5) },
  axisLabel: { fontFamily: FONT.pixel, fontSize: 24, lineHeight: 30, letterSpacing: 1.5, color: T.accent, ...hardShadow(3, 0.6) },
  crossWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  cross: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: T.accent, alignItems: 'center', justifyContent: 'center' },
  crossDot: { width: 4, height: 4, backgroundColor: T.accent },
  toastWrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: { maxWidth: 520, backgroundColor: T.panel, borderWidth: 1, borderColor: T.line, borderRadius: T.radius, paddingVertical: 7, paddingHorizontal: 14 },
  toastText: { color: T.text, fontWeight: '500', fontSize: 13 },
});
