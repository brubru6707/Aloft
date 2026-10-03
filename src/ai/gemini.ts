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

async function callGemini(systemText: string, userText: string, json: boolean): Promise<string> {
  const key = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (!key) throw new Error('No Gemini key: put VITE_GEMINI_API_KEY in .env.local');
  const body = {
    system_instruction: { parts: [{ text: systemText }] },
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    generationConfig: { maxOutputTokens: json ? GEMINI.maxPlanTokens : GEMINI.maxOutputTokens, temperature: json ? 0.3 : 0.4, ...(json ? { responseMimeType: 'application/json' } : {}) },
  };
  let res: Response | null = null;
  for (const model of [GEMINI.model, ...GEMINI.fallbackModels]) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    for (let attempt = 0; attempt <= GEMINI.retries; attempt++) {
      res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) });
      if (res.status !== 503 && res.status !== 429) break;     // overloaded / rate limited: back off and retry
      if (attempt < GEMINI.retries) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
    if (!res || res.ok) break;
    if (res.status !== 503 && res.status !== 404 && res.status !== 429) break;   // a real error: do not mask it with a fallback
  }
  if (!res || !res.ok) throw new Error(`Gemini ${res?.status}: ${((await res?.text()) ?? '').slice(0, 160)}`);
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim();
  if (!text) throw new Error('Gemini returned no text');
  return text;
}

/**
 * Interpret a spoken/typed request about the scene. The model decides whether it is a
 * question (answer) or an edit (rebuild, with a complete replacement list of pieces).
 */
export async function planScene(request: string, pieces: PieceSpec[], context: string): Promise<ScenePlan> {
  const system = GEMINI.systemPrompt + '\n\n' + GEMINI.planPrompt;
  const user = `Current scene summary:\n${context}\n\nCurrent pieces as JSON:\n${JSON.stringify(pieces)}\n\nUser request: ${request}`;
  const raw = await callGemini(system, user, true);
  const jsonText = raw.replace(/^```(?:json)?\s*|\s*```$/g, '');
  const plan = JSON.parse(jsonText) as ScenePlan;
  if (plan.action !== 'rebuild' && plan.action !== 'answer') plan.action = plan.pieces ? 'rebuild' : 'answer';
  if (typeof plan.message !== 'string') plan.message = plan.action === 'rebuild' ? 'Done.' : '';
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
  return callGemini(GEMINI.systemPrompt + (context ? `\n\nCurrent scene:\n${context}` : ''), question, false);
}
