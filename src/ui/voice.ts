/**
 * X2D voice assistant (ElevenLabs Agents).
 *
 * Two layers:
 *  1. A wake-word listener using Chrome's built-in speech recognition. It runs locally,
 *     costs nothing, and only watches for "X2D" (and the ways speech-to-text tends to
 *     hear it). It never talks to ElevenLabs.
 *  2. When the wake word is heard (or the toolbar button is clicked), an ElevenLabs
 *     conversation session starts with the public "Aloft X2D" agent. The agent speaks its
 *     first message ("Hello") and then listens; click the button or stay silent to end.
 * While a session is live the wake-word listener pauses so it does not hear the agent.
 */
import { Conversation } from '@elevenlabs/client';
import { VOICE } from '../config';

export type VoiceState = 'off' | 'listening' | 'connecting' | 'talking' | 'unsupported';

type Recognition = {
  continuous: boolean; interimResults: boolean; lang: string;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null;
  start(): void; stop(): void; abort(): void;
};
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Lower-case, letters and digits only, so "X 2 D", "x-2-d" and "X2D." all compare equal. */
function squash(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export class VoiceAssistant {
  state: VoiceState = 'off';
  lastHeard = '';
  private recognition: Recognition | null = null;
  private wantListening = false;
  private session: Awaited<ReturnType<typeof Conversation.startSession>> | null = null;
  private stateCb: ((s: VoiceState, detail?: string) => void) | null = null;

  onState(cb: (s: VoiceState, detail?: string) => void): void { this.stateCb = cb; }
  private setState(s: VoiceState, detail?: string): void { this.state = s; this.stateCb?.(s, detail); }

  /** Start watching for the wake word. Needs the mic permission once. */
  startListening(): void {
    const Ctor = recognitionCtor();
    if (!Ctor) { this.setState('unsupported', 'speech recognition needs Chrome'); return; }
    if (this.recognition) { this.wantListening = true; return; }
    const r = new Ctor();
    r.continuous = true; r.interimResults = true; r.lang = VOICE.lang;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript;
        this.lastHeard = text.trim();
        const heard = squash(text);
        if (VOICE.wakeWords.some((w) => heard.includes(squash(w)))) {
          void this.startSession();
          break;
        }
      }
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { this.wantListening = false; this.setState('off', 'mic permission denied'); }
    };
    // Chrome stops continuous recognition every so often; restart while we still want it.
    r.onend = () => { if (this.wantListening && !this.session) { try { r.start(); } catch { /* already started */ } } };
    this.recognition = r;
    this.wantListening = true;
    try { r.start(); this.setState('listening'); } catch { this.setState('off', 'could not start listening'); }
  }

  stopListening(): void {
    this.wantListening = false;
    this.recognition?.abort();
    this.recognition = null;
    if (!this.session) this.setState('off');
  }

  /** Open a voice session with the agent (it greets with its first message). */
  async startSession(): Promise<void> {
    if (this.session || this.state === 'connecting') return;
    this.setState('connecting');
    this.recognition?.abort();   // do not transcribe the agent's own voice
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      this.session = await Conversation.startSession({
        agentId: VOICE.agentId,
        connectionType: 'websocket',
        onConnect: () => this.setState('talking'),
        onDisconnect: () => this.endSession(),
        onError: (message: string) => this.setState('off', message),
      });
    } catch (err) {
      this.session = null;
      this.setState('off', err instanceof Error ? err.message : String(err));
      if (this.wantListening) this.resumeListening();
    }
  }

  async endSession(): Promise<void> {
    const s = this.session;
    this.session = null;
    if (s) { try { await s.endSession(); } catch { /* already closed */ } }
    if (this.wantListening) this.resumeListening(); else this.setState('off');
  }

  /** Toolbar button: start a session if idle, end it if talking, start listening if off. */
  toggle(): void {
    if (this.session || this.state === 'connecting') { void this.endSession(); return; }
    if (this.state === 'off' || this.state === 'unsupported') { this.startListening(); }
    void this.startSession();
  }

  private resumeListening(): void {
    const r = this.recognition;
    if (!r) { this.startListening(); return; }
    try { r.start(); } catch { /* already running */ }
    this.setState('listening');
  }
}
