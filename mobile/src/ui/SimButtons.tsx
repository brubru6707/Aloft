import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { engine } from '../core/Engine';
import { T } from './theme';

const ROLE = ['mode', 'action', 'sens', 'reset'];   // what each glove button does (B3 = pinky, GPIO 27)

/**
 * B0–B3 on the right edge. Each lights while that glove button is held. With the touch
 * simulator on they are also pressable (hold = hold); otherwise they are indicators only.
 */
export function SimButtons({ down, pressable }: { down: boolean[]; pressable: boolean }) {
  return (
    <View style={s.row} pointerEvents="box-none">
      {[0, 1, 2, 3].map((b) => (
        <Pressable
          key={b}
          disabled={!pressable}
          onPressIn={() => engine.sim?.setButton(b, true)}
          onPressOut={() => engine.sim?.setButton(b, false)}
          style={[s.btn, down[b] && s.btnDown, !pressable && s.indicator]}
        >
          <Text style={[s.num, down[b] && { color: '#fff' }]}>B{b}</Text>
          <Text style={[s.lbl, down[b] && { color: '#fff' }]}>{ROLE[b]}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 2 },
  btn: {
    width: 28, height: 36, borderRadius: T.radius, backgroundColor: 'rgba(40,40,40,0.5)', borderWidth: 1, borderColor: 'rgba(31,31,31,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },
  btnDown: { backgroundColor: T.select, borderColor: T.selectBorder },
  num: { color: T.text, fontWeight: '700', fontSize: 12, lineHeight: 14 },
  indicator: { opacity: 0.8 },
  lbl: { color: T.muted, fontSize: 8 },
});
