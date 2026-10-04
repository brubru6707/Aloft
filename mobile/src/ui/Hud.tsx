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
export function Crosshair({ hover, color }: { hover: boolean; color?: string }) {
  return (
    <View style={s.crossWrap} pointerEvents="none">
      <View style={[s.cross, color && { borderColor: color }, hover && { transform: [{ scale: 1.35 }] }]}>
        <View style={[s.crossDot, color && { backgroundColor: color }]} />
      </View>
    </View>
  );
}

/** Split view: one half per glove, each with its own crosshair and a one-line "G1 BUILD · MOVE X" label. */
export function SplitOverlay({ hud, views, labelTop }: { hud: HudState; views: { x: number; y: number; w: number; h: number }[]; labelTop: number }) {
  return (
    <>
      {views.map((v, i) => {
        const g = hud.gloves[i];
        return (
          <View key={i} style={{ position: 'absolute', left: v.x, top: v.y, width: v.w, height: v.h }} pointerEvents="none">
            <Crosshair hover={g.hover} color={g.color} />
            <View style={[s.splitLabel, { top: (i === 0 || v.x > 0 ? labelTop : 6) + 34 }]}>
              <Text style={[s.splitTag, { backgroundColor: g.color }]}>G{i + 1}</Text>
              <Text style={[s.splitMode, { color: g.modeColor }]}>{g.mode}</Text>
              {g.flyLabel ? <Text style={s.splitFly}>{g.flyLabel}</Text> : null}
            </View>
          </View>
        );
      })}
      <View style={views[1].x > 0 ? [s.divider, { left: views[1].x - 1, top: 0, bottom: 0, width: 2 }] : [s.divider, { top: views[1].y - 1, left: 0, right: 0, height: 2 }]} pointerEvents="none" />
    </>
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
  modes: { position: 'absolute', left: 12, top: 0, right: 104 },
  modeRow: { flexDirection: 'row', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' },
  modeName: { fontFamily: FONT.pixel, fontSize: 24, letterSpacing: 1.2, lineHeight: 28, ...hardShadow(2, 0.55) },
  hint: { fontSize: 10, color: T.muted, marginTop: 1, ...hardShadow(1, 0.5) },
  axisLabel: { fontFamily: FONT.pixel, fontSize: 17, lineHeight: 22, letterSpacing: 1.2, color: T.accent, ...hardShadow(3, 0.6) },
  crossWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  cross: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: T.accent, alignItems: 'center', justifyContent: 'center' },
  crossDot: { width: 4, height: 4, backgroundColor: T.accent },
  splitLabel: { position: 'absolute', left: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  splitTag: { fontFamily: FONT.pixel, fontSize: 10, color: '#1d1d1d', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, overflow: 'hidden' },
  splitMode: { fontFamily: FONT.pixel, fontSize: 15, ...hardShadow(2, 0.55) },
  splitFly: { fontFamily: FONT.pixel, fontSize: 13, color: T.accent, ...hardShadow(2, 0.55) },
  divider: { position: 'absolute', backgroundColor: '#1f1f1f' },
  toastWrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: { maxWidth: 520, backgroundColor: T.panel, borderWidth: 1, borderColor: T.line, borderRadius: T.radius, paddingVertical: 7, paddingHorizontal: 14 },
  toastText: { color: T.text, fontWeight: '500', fontSize: 12 },
});
