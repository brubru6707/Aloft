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

/** Functions the agent may call during a session (ElevenLabs "client tools"). Each returns text the agent reads. */
export type ClientTools = Record<string, (params: Record<string, unknown>) => Promise<string> | string>;

type Recognition = {
  continuous: boolean; interimResults: boolean; lang: string;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null;
  start(): void; stop(): void; abort(): void;
};
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** A short two-note "hey" whistle, synthesised with Web Audio (no sound file). */
let audioCtx: AudioContext | null = null;
export function whistle(volume = VOICE.whistleVolume): void {
  try {
    audioCtx ??= new AudioContext();
    const ctx = audioCtx;
    const t0 = ctx.currentTime + 0.02;
    // Rising note, short gap, then a higher note that falls away (a friendly "wheet-wheeoo").
    const notes: [number, number, number, number][] = [[1300, 2100, 0, 0.18], [1500, 2600, 0.26, 0.2], [2600, 1700, 0.46, 0.22]];
    for (const [f0, f1, start, dur] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f0, t0 + start);
      osc.frequency.exponentialRampToValueAtTime(f1, t0 + start + dur);
      gain.gain.setValueAtTime(0.0001, t0 + start);
      gain.gain.exponentialRampToValueAtTime(volume, t0 + start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + start);
      osc.stop(t0 + start + dur + 0.02);
    }
  } catch { /* audio is best-effort */ }
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
  private requestCb: ((text: string) => void) | null = null;
  private clientTools: ClientTools = {};
  private pendingRequest: string | null = null;   // request to hand to the agent once the session connects
  private lastActivity = 0;            // last time either side spoke in the session (performance.now())
  private agentSpeaking = false;
  private toolRunning = 0;             // client tools in flight (a build takes a while; that is not silence)
  private whistled = false;            // already whistled for this quiet stretch
  private idleTimer: number | null = null;
  private wakeTimer: number | null = null;   // wake word heard alone: waiting briefly for the request

  onState(cb: (s: VoiceState, detail?: string) => void): void { this.stateCb = cb; }
  /** Called with the words that followed the wake word, e.g. "make it an actual stickman". */
  onRequest(cb: (text: string) => void): void { this.requestCb = cb; }
  /** Tools the agent can call while talking (build_scene, describe_scene, undo_last). */
  setClientTools(tools: ClientTools): void { this.clientTools = tools; }

  /** Tools wrapped so a running build counts as activity, not silence. */
  private wrappedTools(): ClientTools {
    const out: ClientTools = {};
    for (const [name, fn] of Object.entries(this.clientTools)) {
      out[name] = async (params) => {
        this.toolRunning++; this.touch();
        try { return await fn(params); } finally { this.toolRunning--; this.touch(); }
      };
    }
    return out;
  }

  private touch(): void { this.lastActivity = performance.now(); this.whistled = false; }

  /** While a session is open: whistle once when nobody has said anything for VOICE.idleWhistleMs. */
  private startIdleWatch(): void {
    this.stopIdleWatch();
    if (!VOICE.idleWhistleMs) return;
    this.touch();
    this.idleTimer = window.setInterval(() => {
      if (!this.session || this.agentSpeaking || this.toolRunning > 0 || this.whistled) return;
      if (performance.now() - this.lastActivity >= VOICE.idleWhistleMs) { this.whistled = true; whistle(); }
    }, 500);
  }
  private stopIdleWatch(): void {
    if (this.idleTimer !== null) { clearInterval(this.idleTimer); this.idleTimer = null; }
  }

  /** Words after the wake word: hand them to the agent (default flow) or straight to Gemini. */
  private handleRequest(text: string): void {
    if (VOICE.routeViaAgent) void this.startSession(text);
    else this.requestCb?.(text);
  }
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
        const result = e.results[i];
        const text = result[0].transcript;
        this.lastHeard = text.trim();
        // Wait for the final transcript of the utterance so a request after the wake word
        // ("X2D, make it an actual stickman") is captured whole.
        if (!result.isFinal) continue;
        const after = this.afterWakeWord(text);
        if (after === null) {
          // No wake word in this result. If "X2D" was heard alone a moment ago, this IS the request.
          if (this.wakeTimer !== null && text.trim()) { this.clearWakeTimer(); this.handleRequest(text.trim()); break; }
          continue;
        }
        this.clearWakeTimer();
        if (after.trim().length > 0) this.handleRequest(after.trim());
        else this.wakeTimer = window.setTimeout(() => { this.wakeTimer = null; void this.startSession(); }, VOICE.requestGraceMs);
        break;
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

  private clearWakeTimer(): void {
    if (this.wakeTimer !== null) { clearTimeout(this.wakeTimer); this.wakeTimer = null; }
  }

  /** Text following the wake word, '' if the wake word stood alone, null if absent. */
  private afterWakeWord(text: string): string | null {
    const words = text.trim().split(/\s+/);
    for (let n = 1; n <= Math.min(3, words.length); n++) {
      for (let start = 0; start + n <= words.length; start++) {
        const chunk = squash(words.slice(start, start + n).join(' '));
        if (VOICE.wakeWords.some((w) => squash(w) === chunk)) {
          return words.slice(start + n).join(' ').replace(/^[,.!?\s]+/, '');
        }
      }
    }
    return null;
  }

  stopListening(): void {
    this.wantListening = false;
    this.clearWakeTimer();
    this.recognition?.abort();
    this.recognition = null;
    if (!this.session) this.setState('off');
  }

  /**
   * Open a voice session with the agent (it greets with its first message). With `request`,
   * that request is sent to the agent as the user's first message once connected, so
   * "X2D, make me a stickman" reaches the agent, which calls build_scene.
   */
  async startSession(request?: string): Promise<void> {
    if (this.session) { if (request) this.session.sendUserMessage(request); return; }
    if (this.state === 'connecting') { if (request) this.pendingRequest = request; return; }
    this.pendingRequest = request ?? null;
    this.setState('connecting');
    this.clearWakeTimer();
    this.recognition?.abort();   // do not transcribe the agent's own voice
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      this.session = await Conversation.startSession({
        agentId: VOICE.agentId,
        connectionType: 'websocket',
        clientTools: this.wrappedTools(),
        onMessage: () => this.touch(),
        onModeChange: ({ mode }: { mode: string }) => { this.agentSpeaking = mode === 'speaking'; this.touch(); },
        onConnect: () => {
          this.setState('talking');
          this.startIdleWatch();
          // Hand over a request that came with the wake word (after the connection is up).
          const req = this.pendingRequest;
          this.pendingRequest = null;
          if (req) setTimeout(() => this.session?.sendUserMessage(req), 300);
        },
        onUnhandledClientToolCall: (call: { tool_name?: string }) => console.warn('[x2d] agent called an unknown tool:', call?.tool_name),
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
    this.pendingRequest = null;
    this.stopIdleWatch();
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
