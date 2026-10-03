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
  col: { position: 'absolute', right: 12, gap: 8 },
  btn: {
    width: 52, height: 52, borderRadius: T.radius, backgroundColor: 'rgba(40,40,40,0.94)', borderWidth: 1, borderColor: T.line,
    alignItems: 'center', justifyContent: 'center',
  },
  btnDown: { backgroundColor: T.select, borderColor: T.selectBorder },
  num: { color: T.text, fontWeight: '700', fontSize: 18, lineHeight: 20 },
  lbl: { color: T.muted, fontSize: 10 },
});
