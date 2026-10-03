/**
 * Gemini client (Google AI Studio REST API, no SDK). The key comes from
 * EXPO_PUBLIC_GEMINI_API_KEY in .env.local, which is git-ignored and inlined by Metro at
 * build time. Anything shipped in a client app is visible to whoever has the binary, so
 * keep this for local use.
 */
import { GEMINI } from '../config';

const key = (): string | undefined => process.env.EXPO_PUBLIC_GEMINI_API_KEY || undefined;

export const geminiAvailable = (): boolean => !!key();

/** One-shot question. `context` is prepended as a system-style note (e.g. the scene summary). */
export async function askGemini(question: string, context = ''): Promise<string> {
  const k = key();
  if (!k) throw new Error('No Gemini key: put EXPO_PUBLIC_GEMINI_API_KEY in .env.local');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI.model}:generateContent`;
  const body = {
    system_instruction: { parts: [{ text: GEMINI.systemPrompt + (context ? `\n\nCurrent scene:\n${context}` : '') }] },
    contents: [{ role: 'user', parts: [{ text: question }] }],
    generationConfig: { maxOutputTokens: GEMINI.maxOutputTokens, temperature: 0.4 },
  };
  let res: Response | null = null;
  for (let attempt = 0; attempt <= GEMINI.retries; attempt++) {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': k }, body: JSON.stringify(body) });
    if (res.status !== 503 && res.status !== 429) break;     // overloaded / rate limited: back off and retry
    if (attempt < GEMINI.retries) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  if (!res || !res.ok) throw new Error(`Gemini ${res?.status}: ${((await res?.text()) ?? '').slice(0, 160)}`);
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim();
  if (!text) throw new Error('Gemini returned no text');
  return text;
}
