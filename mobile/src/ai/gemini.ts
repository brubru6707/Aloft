/**
 * Gemini client (Google AI Studio REST API, no SDK), ported from the web app. The key comes
 * from EXPO_PUBLIC_GEMINI_API_KEY in .env.local, which is git-ignored and inlined by Metro at
 * build time. Anything shipped in a client app is visible to whoever has the binary, so keep
 * this for local use.
 */
import { GEMINI } from '../config';

import type { PieceSpec } from './scene';

const apiKey = (): string | undefined => process.env.EXPO_PUBLIC_GEMINI_API_KEY || undefined;
export const geminiAvailable = (): boolean => !!apiKey();

/** A request that never answers would leave X2D silent: give up after GEMINI.requestTimeoutMs with a readable error. */
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), GEMINI.requestTimeoutMs);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); }
  catch (err) {
    if (ctrl.signal.aborted) throw new Error(`Gemini timed out after ${Math.round(GEMINI.requestTimeoutMs / 1000)} s`);
    throw err;
  } finally { clearTimeout(timer); }
}

export interface ScenePlan {
  action: 'answer' | 'rebuild';
  message: string;          // short spoken reply
  pieces?: PieceSpec[];     // full replacement layout when action = rebuild
}

type Part = { text?: string };
type Turn = { role: 'user' | 'model'; parts: Part[] };
interface GeminiResponse { candidates?: { content?: { parts?: Part[] }; finishReason?: string }[] }

/** Last raw reply, for debugging: globalThis.__lastGeminiRaw = { model, status, text, finishReason, data }. */
export interface GeminiRaw { model: string; status: number; text: string; finishReason?: string; data: GeminiResponse }
const debugWindow = globalThis as unknown as { __lastGeminiRaw?: GeminiRaw };

interface CallOptions {
  json?: boolean;
  schema?: object;         // generationConfig.responseSchema (structured output)
  maxTokens?: number;
}

/** Request body for one generateContent call (exported so a test harness can send the exact same thing). */
export function buildRequest(systemText: string, contents: Turn[], opts: CallOptions): object {
  const json = !!opts.json;
  return {
    system_instruction: { parts: [{ text: systemText }] },
    contents,
    generationConfig: {
      maxOutputTokens: opts.maxTokens ?? (json ? GEMINI.maxPlanTokens : GEMINI.maxOutputTokens),
      temperature: json ? 0.3 : 0.4,
      ...(json ? { responseMimeType: 'application/json' } : {}),
      ...(opts.schema ? { responseSchema: opts.schema } : {}),
    },
  };
}

function errorMessage(status: number, bodyText: string, model: string): string {
  let msg = bodyText.slice(0, 160);
  try {
    const m = (JSON.parse(bodyText) as { error?: { message?: string } }).error?.message ?? '';
    const retry = m.match(/retry in (\S+)/i)?.[1];
    if (status === 429) msg = `quota exceeded for ${model}${retry ? `, retry in ${retry.replace(/\.\d+s$/, 's')}` : ''}`;
    else if (m) msg = m.split('\n')[0].slice(0, 160);
  } catch { /* not JSON */ }
  return `Gemini ${status}: ${msg}`;
}

/* ---------- model selection: skip exhausted models, prefer the last one that worked ---------- */

interface QuotaState { skipUntil: Record<string, number>; lastGood?: string }

// Kept in memory for the life of the app (no AsyncStorage dependency); a relaunch re-learns it on the first 429.
let quotaState: QuotaState = { skipUntil: {} };
function loadQuota(): QuotaState { return quotaState; }
function saveQuota(q: QuotaState): void { quotaState = q; }

/** Next midnight in America/Los_Angeles (when Gemini free-tier daily quotas reset), as epoch ms. */
function nextPacificMidnight(now = Date.now()): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour12: false, hour: 'numeric', minute: 'numeric', second: 'numeric' })
    .formatToParts(new Date(now));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const secondsIntoDay = (get('hour') % 24) * 3600 + get('minute') * 60 + get('second');
  return now + (86400 - secondsIntoDay) * 1000 + 60_000;   // plus a minute of slack
}

/** How long to skip a model after a 429: a daily quota until the reset, otherwise Google's retry delay. */
function skipUntilFor429(bodyText: string): number {
  if (/PerDay|per day|daily/i.test(bodyText)) return nextPacificMidnight();
  const m = bodyText.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/) ?? bodyText.match(/retry in (\d+(?:\.\d+)?)s/i);
  const seconds = m ? Number(m[1]) : 60;
  return Date.now() + Math.max(5, seconds) * 1000;
}

/** Models to try, in order: the last one that worked, then the configured chain, minus any still out of quota. */
function modelOrder(q: QuotaState): string[] {
  const chain = [GEMINI.model, ...GEMINI.fallbackModels];
  const ordered = q.lastGood && chain.includes(q.lastGood) ? [q.lastGood, ...chain.filter((m) => m !== q.lastGood)] : chain;
  const now = Date.now();
  return ordered.filter((m) => !(q.skipUntil[m] > now));
}

/** Which models are skipped right now and until when (for the console: __aloft.geminiQuota()). */
export function geminiQuotaStatus(): { lastGood?: string; skipped: Record<string, string> } {
  const q = loadQuota();
  const skipped: Record<string, string> = {};
  for (const [m, t] of Object.entries(q.skipUntil)) if (t > Date.now()) skipped[m] = new Date(t).toLocaleString();
  return { lastGood: q.lastGood, skipped };
}

async function callGemini(systemText: string, contents: Turn[], opts: CallOptions): Promise<GeminiRaw> {
  const key = apiKey();
  if (!key) throw new Error('No Gemini key: put EXPO_PUBLIC_GEMINI_API_KEY in .env.local');
  const body = buildRequest(systemText, contents, opts) as { generationConfig: Record<string, unknown> };
  // Builds (JSON plans) think briefly: much faster, and far fewer 503s than long thinking.
  if (opts.json && GEMINI.planThinkingLevel) body.generationConfig.thinkingConfig = { thinkingLevel: GEMINI.planThinkingLevel };
  const q = loadQuota();
  const models = modelOrder(q);
  if (!models.length) {
    const soonest = Math.min(...Object.values(q.skipUntil));
    throw new Error(`Gemini: every model is out of quota until ${new Date(soonest).toLocaleTimeString()}`);
  }
  let res: Response | null = null;
  let model = models[0];
  let lastErr = '';
  for (model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    let r: Response | null = null;
    for (let attempt = 0; attempt <= GEMINI.retries; attempt++) {
      r = await fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) });
      if (r.status !== 503) break;   // only "overloaded" is worth one quick retry on the same model
      if (attempt < GEMINI.retries) await new Promise((done) => setTimeout(done, GEMINI.retryDelayMs));
    }
    res = r!;
    if (res.ok) break;
    if (res.status === 429) {
      // Out of quota: remember it so later builds go straight past this model.
      const text = await res.text();
      lastErr = errorMessage(429, text, model);
      q.skipUntil[model] = skipUntilFor429(text);
      saveQuota(q);
      console.info('[gemini] skipping', model, 'until', new Date(q.skipUntil[model]).toLocaleString());
      continue;
    }
    if (res.status === 503 || res.status === 404) { lastErr = errorMessage(res.status, await res.clone().text(), model); continue; }
    break;   // a real error: do not mask it with a fallback
  }
  if (!res) throw new Error('Gemini: no response');
  if (!res.ok) {
    if (res.bodyUsed) throw new Error(lastErr || `Gemini ${res.status}`);
    throw new Error(errorMessage(res.status, await res.text(), model));
  }
  if (q.lastGood !== model) { q.lastGood = model; saveQuota(q); }
  const data = (await res.json()) as GeminiResponse;
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text ?? '').join('').trim() ?? '';
  const raw: GeminiRaw = { model, status: res.status, text, finishReason: candidate?.finishReason, data };
  debugWindow.__lastGeminiRaw = raw;
  console.debug('[gemini]', raw.model, raw.finishReason, raw.text);
  if (!text) throw new Error(`Gemini (${model}) returned no text${raw.finishReason ? ` (${raw.finishReason})` : ''}`);
  return raw;
}

/** Parse the model's JSON, tolerating code fences and stray text around the object. */
function parsePlan(raw: GeminiRaw): ScenePlan {
  let text = raw.text.replace(/^```(?:json)?\s*|\s*```$/g, '');
  const a = text.indexOf('{'); const b = text.lastIndexOf('}');
  if (a >= 0 && b > a) text = text.slice(a, b + 1);
  let plan: ScenePlan;
  try { plan = JSON.parse(text) as ScenePlan; }
  catch { throw new Error(raw.finishReason === 'MAX_TOKENS' ? `Gemini (${raw.model}) ran out of tokens before finishing the layout` : `Gemini (${raw.model}) returned invalid JSON`); }
  if (!Array.isArray(plan.pieces)) plan.pieces = [];
  if (plan.action !== 'rebuild' && plan.action !== 'answer') plan.action = plan.pieces.length ? 'rebuild' : 'answer';
  if (typeof plan.message !== 'string') plan.message = plan.action === 'rebuild' ? 'Done.' : '';
  return plan;
}

/** Cheap client-side classifier: does this read as an instruction about the scene rather than a question? */
export function isImperative(request: string): boolean {
  return GEMINI.imperativePattern.test(request) && !GEMINI.questionPattern.test(request);
}

/**
 * Interpret a spoken/typed request about the scene. The model decides whether it is a
 * question (answer) or an edit (rebuild, with a complete replacement list of pieces).
 * `forceRebuild` (set by isImperative) tells the model it must rebuild; if it still answers,
 * or rebuilds with no pieces, it is asked once more in the same conversation.
 */
export async function planScene(request: string, pieces: PieceSpec[], context: string, forceRebuild = false): Promise<ScenePlan> {
  const system = GEMINI.systemPrompt + '\n\n' + GEMINI.planPrompt + (forceRebuild ? '\n\n' + GEMINI.forceRebuildNote : '');
  const user = `Current scene summary:\n${context}\n\nCurrent pieces as JSON:\n${JSON.stringify(pieces)}\n\nUser request: ${request}`;
  const contents: Turn[] = [{ role: 'user', parts: [{ text: user }] }];
  const opts: CallOptions = { json: true, schema: GEMINI.planSchema };
  let raw = await callGemini(system, contents, opts);
  let plan = parsePlan(raw);
  const reask = plan.action === 'rebuild' && !plan.pieces!.length ? GEMINI.reaskNoPieces
    : plan.action === 'answer' && forceRebuild ? GEMINI.reaskNotQuestion : null;
  if (reask) {
    contents.push({ role: 'model', parts: [{ text: raw.text }] }, { role: 'user', parts: [{ text: reask }] });
    raw = await callGemini(system, contents, opts);
    plan = parsePlan(raw);
  }
  return plan;
}

/** Models this key can call with generateContent (for picking GEMINI.model / fallbacks). */
export async function listGeminiModels(): Promise<string[]> {
  const key = apiKey();
  if (!key) return [];
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100', { headers: { 'x-goog-api-key': key } });
  const data = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
  return (data.models ?? []).filter((m) => m.supportedGenerationMethods?.includes('generateContent')).map((m) => m.name.replace('models/', ''));
}

/** One-shot question. `context` is prepended as a system-style note (e.g. the scene summary). */
export async function askGemini(question: string, context = ''): Promise<string> {
  const raw = await callGemini(GEMINI.systemPrompt + (context ? `\n\nCurrent scene:\n${context}` : ''), [{ role: 'user', parts: [{ text: question }] }], {});
  return raw.text;
}
