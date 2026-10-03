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

function Shell() {
  const [tab, setTab] = useState<Tab>('nav');
  const insets = useSafeAreaInsets();
  const hud = useHud();

  // Keep the screen on while a glove (or the simulator) is connected.
  useEffect(() => {
    if (hud.connected) activateKeepAwakeAsync('aloft').catch(() => {});
    else deactivateKeepAwake('aloft').catch(() => {});
  }, [hud.connected]);

  const barHeight = Math.max(8, insets.bottom - 14);   // no bottom bar any more: just keep clear of the home indicator
  return (
    <View style={s.root}>
      {tab === 'nav' ? <MainScreen tabBarHeight={barHeight} /> : <TestScreen tabBarHeight={barHeight} />}
      <View style={s.switcher}>
        {(['nav', 'test'] as Tab[]).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={[s.tab, tab === t && s.tabOn]} hitSlop={6}>
            <Text style={[s.tabText, tab === t && { color: T.darkText }]}>{t === 'nav' ? 'NAV' : 'TEST'}</Text>
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
  // Left-edge NAV / TEST switch, vertically centred, out of the way of the 3D view and the dock.
  switcher: { position: 'absolute', left: 4, top: '45%', gap: 4 },
  tab: { width: 40, paddingVertical: 6, borderRadius: T.radius, alignItems: 'center', backgroundColor: 'rgba(40,40,40,0.6)', borderWidth: 1, borderColor: 'rgba(31,31,31,0.6)' },
  tabOn: { backgroundColor: T.accent, borderColor: T.accent },
  tabText: { color: T.muted, fontWeight: '700', fontSize: 9, letterSpacing: 0.8 },
});
