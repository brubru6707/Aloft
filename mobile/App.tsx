import { ConversationProvider } from '@elevenlabs/react-native';
import { useFonts } from 'expo-font';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHud } from './src/core/useHud';
import { MainScreen } from './src/screens/MainScreen';
import { SimButtons } from './src/ui/SimButtons';
import { TestScreen } from './src/screens/TestScreen';
import { VOICE } from './src/config';
import { VoiceAssistant } from './src/ui/VoiceAssistant';
import { FONT, T } from './src/ui/theme';

type Tab = 'nav' | 'test';
const BOTTOM_ROW = 40;   // NAV / TEST (left) and B0–B3 (right)

function Shell() {
  const [tab, setTab] = useState<Tab>('nav');
  const insets = useSafeAreaInsets();
  const hud = useHud();

  // Keep the screen on while a glove (or the simulator) is connected.
  useEffect(() => {
    if (hud.connected) activateKeepAwakeAsync('aloft').catch(() => {});
    else deactivateKeepAwake('aloft').catch(() => {});
  }, [hud.connected]);

  const bottomPad = Math.max(4, insets.bottom - 18);   // the row sits down in the home-indicator area
  const barHeight = BOTTOM_ROW + bottomPad;           // screens keep their content above this row
  return (
    <View style={s.root}>
      {tab === 'nav' ? <MainScreen tabBarHeight={barHeight} /> : <TestScreen tabBarHeight={barHeight} />}
      <View style={[s.bottomRow, { paddingBottom: bottomPad, height: barHeight }]} pointerEvents="box-none">
        <View style={s.switcher}>
          {(['nav', 'test'] as Tab[]).map((t) => (
            <Pressable key={t} onPress={() => setTab(t)} style={[s.tab, tab === t && s.tabOn]} hitSlop={6}>
              <Text style={[s.tabText, tab === t && { color: T.darkText }]}>{t === 'nav' ? 'NAV' : 'TEST'}</Text>
            </Pressable>
          ))}
        </View>
        {/* B0–B3: light while held on the glove; pressable when the simulator is on. */}
        <SimButtons down={hud.buttons} pressable={hud.sourceKind === 'sim'} />
      </View>
      <StatusBar style="light" />
    </View>
  );
}

export default function App() {
  const [loaded] = useFonts({
    [FONT.pixel]: require('./assets/fonts/PixelifySans-Bold.ttf'),
  });
  useEffect(() => { if (loaded) SplashScreen.hideAsync().catch(() => {}); }, [loaded]);
  if (!loaded) return <View style={s.root} />;
  return (
    <SafeAreaProvider>
      <ConversationProvider agentId={VOICE.agentId} connectionType="webrtc">
        <Shell />
        <VoiceAssistant />
      </ConversationProvider>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  // Bottom row: NAV / TEST on the left, B0–B3 on the right.
  bottomRow: { position: 'absolute', left: 26, right: 14, bottom: 0, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  switcher: { flexDirection: 'row', gap: 4 },
  tab: { width: 38, paddingVertical: 5, borderRadius: T.radius, alignItems: 'center', backgroundColor: 'rgba(40,40,40,0.6)', borderWidth: 1, borderColor: 'rgba(31,31,31,0.6)' },
  tabOn: { backgroundColor: T.accent, borderColor: T.accent },
  tabText: { color: T.muted, fontWeight: '700', fontSize: 9, letterSpacing: 0.8 },
});
