import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { HudState } from '../core/Engine';
import { FONT, T, hardShadow } from './theme';

/** Top-left overlay: mode name in the mode colour, one-line hint, FLY state label. */
export function ModeLabel({ hud, compact }: { hud: HudState; compact?: boolean }) {
  return (
    <View style={s.modes} pointerEvents="none">
      <Text style={[s.modeName, { color: hud.modeColor }, compact && { fontSize: 30 }]}>{hud.mode}</Text>
      <Text style={s.hint} numberOfLines={compact ? 1 : 2}>{hud.hint}</Text>
      {hud.flyLabel ? <Text style={[s.axisLabel, compact && { fontSize: 36 }]}>{hud.flyLabel}</Text> : null}
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

export function Toast({ text, bottom }: { text: string; bottom: number }) {
  if (!text) return null;
  return (
    <View style={[s.toastWrap, { bottom }]} pointerEvents="none">
      <View style={s.toast}><Text style={s.toastText}>{text}</Text></View>
    </View>
  );
}

const s = StyleSheet.create({
  modes: { position: 'absolute', left: 14, top: 0, right: 150 },
  modeName: { fontFamily: FONT.bold, fontSize: 44, letterSpacing: 1.5, lineHeight: 48, ...hardShadow(2, 0.55) },
  hint: { fontFamily: FONT.regular, fontSize: 13, color: T.muted, marginTop: 2, ...hardShadow(1, 0.5) },
  axisLabel: { fontFamily: FONT.bold, fontSize: 52, lineHeight: 56, marginTop: 8, letterSpacing: 2, color: T.accent, ...hardShadow(3, 0.6) },
  crossWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  cross: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: T.accent, alignItems: 'center', justifyContent: 'center' },
  crossDot: { width: 4, height: 4, backgroundColor: T.accent },
  toastWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  toast: { backgroundColor: T.panel, borderWidth: 1, borderColor: T.line, borderRadius: T.radius, paddingVertical: 7, paddingHorizontal: 14 },
  toastText: { color: T.text, fontFamily: FONT.medium, fontSize: 13 },
});
