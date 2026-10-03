import { useConversationControls, useConversationStatus } from '@elevenlabs/react-native';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useEffect, useRef } from 'react';
import { engine } from '../core/Engine';
import { VOICE } from '../config';

export type VoiceState = 'off' | 'listening' | 'connecting' | 'talking' | 'unsupported';

/** Lower-case, letters and digits only, so "X 2 D", "x-2-d" and "X2D." all compare equal. */
function squash(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}
const WAKE = VOICE.wakeWords.map(squash);

/**
 * X2D voice assistant (ElevenLabs Agents), native port of the web ui/voice.ts.
 *
 * Two layers:
 *  1. A wake-word listener using the phone's speech recognition (expo-speech-recognition).
 *     It runs locally and only watches for "X2D" (and the ways speech-to-text tends to hear it).
 *  2. When the wake word is heard (or the 🎙 X2D button is tapped), an ElevenLabs conversation
 *     session starts with the public "Aloft X2D" agent over WebRTC. The agent speaks its first
 *     message ("Hello") and then listens; tap the button again to hang up.
 * While a session is live the wake-word listener pauses so it does not hear the agent.
 * Renders nothing; it publishes its state to the engine for the bottom sheet.
 */
export function VoiceAssistant() {
  const { startSession, endSession } = useConversationControls();
  const { status, message } = useConversationStatus();
  const wantListening = useRef(false);
  const recognizing = useRef(false);
  const sessionOpen = useRef(false);
  const lastStatus = useRef(status);

  const setState = (s: VoiceState, detail?: string) => engine.setVoiceState(s, detail);

  const startRecognizer = () => {
    if (recognizing.current || sessionOpen.current) return;
    try {
      ExpoSpeechRecognitionModule.start({ lang: VOICE.lang, interimResults: true, continuous: true, requiresOnDeviceRecognition: false });
      recognizing.current = true;
      setState('listening');
    } catch (e) {
      setState('off', e instanceof Error ? e.message : 'could not start listening');
    }
  };

  const startListening = async () => {
    wantListening.current = true;
    const res = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!res.granted) { wantListening.current = false; setState('off', 'mic permission denied'); return; }
    startRecognizer();
  };

  const stopListening = () => {
    wantListening.current = false;
    if (recognizing.current) ExpoSpeechRecognitionModule.abort();
    recognizing.current = false;
    if (!sessionOpen.current) setState('off');
  };

  const openSession = () => {
    if (sessionOpen.current) return;
    sessionOpen.current = true;
    setState('connecting');
    if (recognizing.current) { ExpoSpeechRecognitionModule.abort(); recognizing.current = false; }   // do not transcribe the agent's own voice
    startSession({
      agentId: VOICE.agentId,
      connectionType: 'webrtc',
      onConnect: () => setState('talking'),
      onDisconnect: () => closeSession(),
      onError: (m: string) => { setState('off', m); closeSession(); },
    });
  };

  const closeSession = () => {
    if (!sessionOpen.current) return;
    sessionOpen.current = false;
    try { endSession(); } catch { /* already closed */ }
    if (wantListening.current) startRecognizer(); else setState('off');
  };

  // Wake-word listener events.
  useSpeechRecognitionEvent('result', (e) => {
    for (const r of e.results) {
      const heard = squash(r.transcript);
      if (WAKE.some((w) => heard.includes(w))) { openSession(); break; }
    }
  });
  useSpeechRecognitionEvent('end', () => {
    recognizing.current = false;
    // The OS stops continuous recognition every so often; restart while we still want it.
    if (wantListening.current && !sessionOpen.current) setTimeout(startRecognizer, 300);
  });
  useSpeechRecognitionEvent('error', (e) => {
    recognizing.current = false;
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { wantListening.current = false; setState('off', 'mic permission denied'); }
    else if (e.error === 'language-not-supported') { wantListening.current = false; setState('unsupported', 'speech recognition unavailable'); }
    else if (wantListening.current && !sessionOpen.current) setTimeout(startRecognizer, 1000);
  });

  // Mirror the agent connection state.
  useEffect(() => {
    if (status === lastStatus.current) return;
    lastStatus.current = status;
    if (status === 'connected') setState('talking');
    else if (status === 'error') { setState('off', message ?? 'voice error'); closeSession(); }
    else if (status === 'disconnected' && sessionOpen.current) closeSession();
  }, [status, message]);

  // Button: start a session if idle, end it if talking, start listening if off.
  useEffect(() => {
    engine.voiceToggle = () => {
      if (sessionOpen.current) { closeSession(); return; }
      if (!wantListening.current) void startListening();
      openSession();
    };
    if (VOICE.autoListen) void startListening();
    return () => { engine.voiceToggle = null; stopListening(); };
  }, []);

  return null;
}
