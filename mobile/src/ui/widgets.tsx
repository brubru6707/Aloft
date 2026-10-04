import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { T } from './theme';

/** Flat Blender-style button. `active` = selection blue, `accent` = orange primary, `danger` = red. */
export function Btn({ label, onPress, active, accent, danger, disabled, style, small }: {
  label: string; onPress?: () => void; active?: boolean; accent?: boolean; danger?: boolean; disabled?: boolean;
  style?: StyleProp<ViewStyle>; small?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.btn,
        small && s.btnSmall,
        active && s.btnActive,
        accent && s.btnAccent,
        danger && s.btnDanger,
        pressed && !disabled && s.btnPressed,
        disabled && s.disabled,
        style,
      ]}
    >
      <Text style={[s.btnText, small && s.btnTextSmall, (active || accent || danger) && s.btnTextOn, active && { color: '#fff' }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

/** Small chip (mode / FLY state). `onColor` fills the chip when `on`. */
export function Chip({ label, on, onColor, onPress, style, flex }: {
  label: string; on?: boolean; onColor?: string; onPress?: () => void; style?: StyleProp<ViewStyle>; flex?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.chip, flex && { flex: 1 }, pressed && { backgroundColor: T.btnHover }, on && { backgroundColor: onColor ?? T.accent }, style]}
    >
      <Text style={[s.chipText, on && { color: T.darkText }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

/** Labelled value box (ROLL / PITCH / YAW). */
export function Readout({ label, value, big, children }: { label: string; value: string; big?: boolean; children?: React.ReactNode }) {
  return (
    <View style={[s.readout, !big && !children && s.readoutInline]}>
      <Text style={s.readoutLabel}>{label}</Text>
      <Text style={[s.readoutValue, big && { fontSize: 24 }]}>{value}</Text>
      {children}
    </View>
  );
}

/** Signed bar: fills from the centre toward − or + (value −1..1). */
export function SignedBar({ value, color = T.accent, height = 8, style }: { value: number; color?: string; height?: number; style?: StyleProp<ViewStyle> }) {
  const v = Math.max(-1, Math.min(1, value));
  const left = v < 0 ? 50 + v * 50 : 50;
  const width = Math.abs(v) * 50;
  return (
    <View style={[s.bar, { height }, style]}>
      <View style={s.barMid} />
      <View style={[s.barFill, { left: `${left}%`, width: `${width}%`, backgroundColor: color }]} />
    </View>
  );
}

/** Button indicator that lights while pressed. */
export function ButtonLamp({ label, sub, down, onColor = T.select, textOn = '#fff' }: { label: string; sub?: string; down: boolean; onColor?: string; textOn?: string }) {
  return (
    <View style={[s.lamp, down && { backgroundColor: onColor, borderColor: onColor }]}>
      <Text style={[s.lampText, down && { color: textOn }]}>{label}</Text>
      {sub ? <Text style={[s.lampSub, down && { color: textOn }]}>{sub}</Text> : null}
    </View>
  );
}

export function Panel({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.panel, style]}>{children}</View>;
}

export function H2({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.h2, style]}>{children}</Text>;
}

export const fmtDeg = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(0) + '°';
export const fmt1 = (v: number, d = 1) => (v >= 0 ? '+' : '') + v.toFixed(d);

const s = StyleSheet.create({
  btn: {
    backgroundColor: T.btn, borderWidth: 1, borderColor: T.line, borderRadius: T.radius,
    paddingVertical: 8, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center',
  },
  btnSmall: { paddingVertical: 5, paddingHorizontal: 7 },
  btnPressed: { backgroundColor: T.btnHover },
  btnActive: { backgroundColor: T.select, borderColor: T.selectBorder },
  btnAccent: { backgroundColor: T.accent, borderColor: T.accent },
  btnDanger: { backgroundColor: T.bad, borderColor: T.bad },
  btnText: { color: T.text, fontWeight: '500', fontSize: 12 },
  btnTextSmall: { fontSize: 11 },
  btnTextOn: { color: T.darkText, fontWeight: '700' },
  disabled: { opacity: 0.45 },
  chip: {
    backgroundColor: T.btn, borderWidth: 1, borderColor: T.line, borderRadius: T.radius,
    paddingVertical: 5, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center',
  },
  chipText: { color: T.text, fontWeight: '500', fontSize: 10, letterSpacing: 0.2 },
  readout: { flex: 1, backgroundColor: T.panel2, borderWidth: 1, borderColor: T.line, borderRadius: T.radius, paddingVertical: 5, paddingHorizontal: 8 },
  readoutLabel: { color: T.muted, fontSize: 9, letterSpacing: 1 },
  readoutValue: { color: T.text, fontWeight: '500', fontSize: 14, fontVariant: ['tabular-nums'] },
  // Plain readouts (Glove tab): label and value on one line, half the height.
  readoutInline: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingVertical: 3, paddingHorizontal: 6 },
  bar: { position: 'relative', flex: 1, minWidth: 40, borderRadius: 2, backgroundColor: T.panel2, borderWidth: 1, borderColor: T.line, overflow: 'hidden' },
  barMid: { position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, backgroundColor: T.lineSoft },
  barFill: { position: 'absolute', top: 0, bottom: 0 },
  lamp: {
    flex: 1, minHeight: 24, borderRadius: T.radius, borderWidth: 1, borderColor: T.line, backgroundColor: T.panel2,
    alignItems: 'center', justifyContent: 'center', paddingVertical: 3,
  },
  lampText: { color: T.muted, fontWeight: '500', fontSize: 10 },
  lampSub: { color: T.muted, fontSize: 9 },
  panel: { backgroundColor: T.panel, borderWidth: 1, borderColor: T.line, borderRadius: T.radius, paddingVertical: 12, paddingHorizontal: 14, marginTop: 12 },
  h2: { color: T.muted, fontWeight: '500', fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 },
});
