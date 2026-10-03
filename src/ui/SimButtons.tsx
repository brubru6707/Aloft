import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { engine } from '../core/Engine';
import { T } from './theme';

/** On-screen glove buttons 1–4 (B0–B3) for the touch simulator. Hold = hold. */
export function SimButtons({ down }: { down: boolean[] }) {
  return (
    <View style={s.col} pointerEvents="box-none">
      {[0, 1, 2, 3].map((b) => (
        <Pressable
          key={b}
          onPressIn={() => engine.sim?.setButton(b, true)}
          onPressOut={() => engine.sim?.setButton(b, false)}
          style={[s.btn, down[b] && s.btnDown]}
        >
          <Text style={[s.num, down[b] && { color: '#fff' }]}>{b + 1}</Text>
          <Text style={[s.lbl, down[b] && { color: '#fff' }]}>B{b}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  col: { position: 'absolute', right: 10, gap: 6 },
  btn: {
    width: 42, height: 42, borderRadius: T.radius, backgroundColor: 'rgba(40,40,40,0.5)', borderWidth: 1, borderColor: 'rgba(31,31,31,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },
  btnDown: { backgroundColor: T.select, borderColor: T.selectBorder },
  num: { color: T.text, fontWeight: '700', fontSize: 15, lineHeight: 17 },
  lbl: { color: T.muted, fontSize: 9 },
});
