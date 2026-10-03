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
import { TestScreen } from './src/screens/TestScreen';
import { VOICE } from './src/config';
import { VoiceAssistant } from './src/ui/VoiceAssistant';
import { FONT, T } from './src/ui/theme';

type Tab = 'nav' | 'test';
const TAB_BAR = 28;

function Shell() {
  const [tab, setTab] = useState<Tab>('nav');
  const insets = useSafeAreaInsets();
  const hud = useHud();

  // Keep the screen on while a glove (or the simulator) is connected.
  useEffect(() => {
    if (hud.connected) activateKeepAwakeAsync('aloft').catch(() => {});
    else deactivateKeepAwake('aloft').catch(() => {});
  }, [hud.connected]);

  const barHeight = TAB_BAR + Math.max(0, insets.bottom - 14);   // sit in the home-indicator area instead of above it
  return (
    <View style={s.root}>
      {tab === 'nav' ? <MainScreen tabBarHeight={barHeight} /> : <TestScreen tabBarHeight={barHeight} />}
      <View style={[s.tabBar, { height: barHeight, paddingBottom: Math.max(0, insets.bottom - 14) }]}>
        {(['nav', 'test'] as Tab[]).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={s.tab}>
            <Text style={[s.tabText, tab === t && { color: T.accent }]}>{t === 'nav' ? 'NAV' : 'TEST'}</Text>
          </Pressable>
        ))}
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
  tabBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', backgroundColor: T.panel, borderTopWidth: 1, borderColor: T.line },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabText: { color: T.muted, fontWeight: '700', fontSize: 10, letterSpacing: 1.2 },
});
