import { useConversationControls, useConversationStatus } from '@elevenlabs/react-native';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { engine } from '../core/Engine';
import { VOICE } from '../config';

export type VoiceState = 'off' | 'listening' | 'connecting' | 'talking' | 'unsupported';

/** Lower-case, letters and digits only, so "X 2 D", "x-2-d" and "X2D." all compare equal. */
function squash(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}
const WAKE = VOICE.wakeWords.map(squash);

/** Text after the wake word, '' if it stood alone, null if absent (same rule as the web app). */
function afterWakeWord(text: string): string | null {
  const words = text.trim().split(/\s+/);
  for (let n = 1; n <= Math.min(3, words.length); n++) {
    for (let start = 0; start + n <= words.length; start++) {
      if (WAKE.includes(squash(words.slice(start, start + n).join(' ')))) {
        return words.slice(start + n).join(' ').replace(/^[,.!?\s]+/, '');
      }
    }
  }
  return null;
}

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
  const { startSession, endSession, sendUserMessage } = useConversationControls();
  const pendingRequest = useRef<string | null>(null);   // words said after "X2D", handed to the agent once connected
  const wakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearWake = () => { if (wakeTimer.current) { clearTimeout(wakeTimer.current); wakeTimer.current = null; } };
  const { status, message } = useConversationStatus();
  const wantListening = useRef(false);
  const recognizing = useRef(false);
  const sessionOpen = useRef(false);
  const lastStatus = useRef(status);
  const failures = useRef(0);                       // consecutive recognizer failures (back-off)
  const appActive = useRef(AppState.currentState === 'active');   // iOS refuses the mic in the background
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setState = (s: VoiceState, detail?: string) => engine.setVoiceState(s, detail);

  /** Restart later, backing off 1 s, 2 s, 4 s … up to 30 s; give up after 8 failures in a row. */
  const scheduleRestart = (failed: boolean) => {
    if (retryTimer.current) return;   // 'error' and 'end' both fire for one failure: restart once
    if (!appActive.current) return;   // locked / in the background: resume when the app comes back, not counted
    if (failed) failures.current++;
    if (failures.current >= 8) { wantListening.current = false; setState('off', 'mic busy: tap the mic to try again'); return; }
    const delay = failed ? Math.min(30000, 1000 * 2 ** (failures.current - 1)) : 300;
    retryTimer.current = setTimeout(() => { retryTimer.current = null; if (wantListening.current && !sessionOpen.current) startRecognizer(); }, delay);
  };

  const startRecognizer = () => {
    if (recognizing.current || sessionOpen.current) return;
    try {
      ExpoSpeechRecognitionModule.start({
        lang: VOICE.lang, interimResults: true, continuous: true, requiresOnDeviceRecognition: false,
        // Listen through Bluetooth headphones / AirPods when connected, not only the phone's own mic.
        iosCategory: { category: 'playAndRecord', categoryOptions: ['defaultToSpeaker', 'allowBluetooth'], mode: 'measurement' },
      });
      console.log('[x2d] wake-word listener started');
      recognizing.current = true;
      setState('listening');
    } catch (e) {
      setState('off', e instanceof Error ? e.message : 'could not start listening');
    }
  };

  const startListening = async () => {
    wantListening.current = true;
    failures.current = 0;
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

  const openSession = (request?: string) => {
    clearWake();
    if (sessionOpen.current) { if (request) sendUserMessage(request); return; }
    pendingRequest.current = request ?? null;
    sessionOpen.current = true;
    setState('connecting');
    if (recognizing.current) { ExpoSpeechRecognitionModule.abort(); recognizing.current = false; }   // do not transcribe the agent's own voice
    startSession({
      agentId: VOICE.agentId,
      connectionType: 'webrtc',
      // The agent builds through these (build_scene → Gemini → pieces), like the web app.
      clientTools: engine.agentTools(),
      onConnect: () => {
        setState('talking');
        const req = pendingRequest.current;
        pendingRequest.current = null;
        if (req) setTimeout(() => sendUserMessage(req), 300);
      },
      onUnhandledClientToolCall: (call: { tool_name?: string }) => console.warn('[x2d] agent called an unknown tool:', call?.tool_name),
      onDisconnect: (details?: unknown) => { console.log('[x2d] session ended by the SDK:', JSON.stringify(details ?? null)); closeSession('sdk onDisconnect'); },
      onError: (m: string) => { console.log('[x2d] SDK error:', m); setState('off', m); closeSession('sdk onError'); },
    });
  };

  const closeSession = (reason: string) => {
    console.log('[x2d] closing session:', reason);
    if (!sessionOpen.current) return;
    sessionOpen.current = false;
    pendingRequest.current = null;
    try { endSession(); } catch { /* already closed */ }
    if (wantListening.current) startRecognizer(); else setState('off');
  };

  // Wake-word listener events.
  // iOS continuous recognition rarely marks a result final, so act on the live transcript: once the
  // wake word appears, wait for a short pause (VOICE.wakeSettleMs) to catch the request that follows,
  // then open the session with whatever came after "X2D" (or none).
  const heardAfter = useRef<string | null>(null);
  useSpeechRecognitionEvent('result', (e) => {
    failures.current = 0;   // it hears speech, so the mic works
    if (sessionOpen.current) return;
    const text = e.results[0]?.transcript ?? '';
    const after = afterWakeWord(text);
    if (after === null) {
      if (e.isFinal && text.trim()) console.log('[x2d] heard (no wake word):', text.trim());
      return;
    }
    if (heardAfter.current === null) console.log('[x2d] wake word heard:', text.trim());
    heardAfter.current = after;
    clearWake();
    const fire = () => { wakeTimer.current = null; const req = heardAfter.current?.trim() || undefined; heardAfter.current = null; openSession(req); };
    if (e.isFinal) fire();
    else wakeTimer.current = setTimeout(fire, VOICE.wakeSettleMs);
  });
  useSpeechRecognitionEvent('end', () => {
    recognizing.current = false;
    // The OS stops continuous recognition every so often; restart while we still want it.
    if (wantListening.current && !sessionOpen.current) scheduleRestart(false);
  });
  useSpeechRecognitionEvent('error', (e) => {
    recognizing.current = false;
    if (e.error !== 'aborted' && e.error !== 'no-speech') console.log('[x2d] wake-word listener error:', e.error, e.message ?? '');
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { wantListening.current = false; setState('off', 'mic permission denied'); }
    else if (e.error === 'language-not-supported') { wantListening.current = false; setState('unsupported', 'speech recognition unavailable'); }
    else if (wantListening.current && !sessionOpen.current) scheduleRestart(e.error !== 'no-speech' && e.error !== 'aborted');
  });

  // Mirror the agent connection state.
  useEffect(() => {
    if (status === lastStatus.current) return;
    lastStatus.current = status;
    if (status === 'connected') setState('talking');
    else if (status === 'error') { setState('off', message ?? 'voice error'); closeSession(`status error: ${message ?? ''}`); }
    else if (status === 'disconnected' && sessionOpen.current) closeSession('status disconnected');
  }, [status, message]);

  // Locked / backgrounded: pause quietly (iOS refuses the mic, and those failures must not count).
  // Back in front: clear the failure count and listen again, so "X2D" keeps working after the
  // phone sleeps.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      const active = st === 'active';
      if (active === appActive.current) return;
      appActive.current = active;
      if (active) {
        failures.current = 0;
        if (VOICE.autoListen && !sessionOpen.current) {
          console.log('[x2d] app active again: wake-word listener restarting');
          recognizing.current = false;
          void startListening();
        }
      } else {
        if (retryTimer.current) { clearTimeout(retryTimer.current); retryTimer.current = null; }
        if (recognizing.current) { try { ExpoSpeechRecognitionModule.abort(); } catch { /* already stopped */ } }
        recognizing.current = false;
      }
    });
    return () => sub.remove();
  }, []);

  // Button: start a session if idle, end it if talking, start listening if off.
  useEffect(() => {
    engine.voiceToggle = () => {
      if (sessionOpen.current) { closeSession('mic button pressed while a session was open'); return; }
      if (!wantListening.current) void startListening();
      openSession();
    };
    if (VOICE.autoListen) void startListening();
    return () => { engine.voiceToggle = null; stopListening(); };
  }, []);

  return null;
}
