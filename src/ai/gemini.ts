/**
 * Gemini client (Google AI Studio REST API, no SDK). The key comes from
 * VITE_GEMINI_API_KEY in .env.local, which is git-ignored. Anything shipped to a
 * browser is visible to whoever loads the page, so keep this for local use.
 */
import { GEMINI } from '../config';

import type { PieceSpec } from './scene';

export const geminiAvailable = (): boolean => !!import.meta.env.VITE_GEMINI_API_KEY;

export interface ScenePlan {
  action: 'answer' | 'rebuild';
  message: string;          // short spoken reply
  pieces?: PieceSpec[];     // full replacement layout when action = rebuild
}

type Part = { text?: string };
type Turn = { role: 'user' | 'model'; parts: Part[] };
interface GeminiResponse { candidates?: { content?: { parts?: Part[] }; finishReason?: string }[] }

/** Last raw reply, for debugging from the console: window.__lastGeminiRaw = { model, status, text, finishReason, data }. */
export interface GeminiRaw { model: string; status: number; text: string; finishReason?: string; data: GeminiResponse }
const debugWindow = window as unknown as { __lastGeminiRaw?: GeminiRaw };

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

async function callGemini(systemText: string, contents: Turn[], opts: CallOptions): Promise<GeminiRaw> {
  const key = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (!key) throw new Error('No Gemini key: put VITE_GEMINI_API_KEY in .env.local');
  const body = buildRequest(systemText, contents, opts);
  let res: Response | null = null;
  let model = GEMINI.model;
  for (model of [GEMINI.model, ...GEMINI.fallbackModels]) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    for (let attempt = 0; attempt <= GEMINI.retries; attempt++) {
      res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) });
      if (res.status !== 503 && res.status !== 429) break;     // overloaded / rate limited: back off and retry
      if (attempt < GEMINI.retries) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
    if (!res || res.ok) break;
    if (res.status !== 503 && res.status !== 404 && res.status !== 429) break;   // a real error: do not mask it with a fallback
  }
  if (!res) throw new Error('Gemini: no response');
  if (!res.ok) throw new Error(errorMessage(res.status, await res.text(), model));
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
  const key = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
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
