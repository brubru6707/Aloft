/**
 * Vercel Function: forwards Aloft's Gemini requests to Google with the key kept server-side
 * (GEMINI_API_KEY in the project's environment variables), so the key is never in the
 * browser bundle. Only the models the app's fallback chain uses are allowed through.
 */
declare const process: { env: Record<string, string | undefined> };   // Node global on Vercel (no @types/node needed)

const ALLOWED_MODELS = new Set([
  'gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.8-flash', 'gemini-3-flash-preview', 'gemini-3.5-flash-lite',
]);
const MAX_BODY_BYTES = 200_000;

export async function POST(request: Request): Promise<Response> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return Response.json({ error: { message: 'GEMINI_API_KEY is not set on the server' } }, { status: 500 });
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return Response.json({ error: { message: 'request too large' } }, { status: 413 });
  let parsed: { model?: string; body?: unknown };
  try { parsed = JSON.parse(raw); } catch { return Response.json({ error: { message: 'invalid JSON' } }, { status: 400 }); }
  const model = String(parsed.model ?? '');
  if (!ALLOWED_MODELS.has(model)) return Response.json({ error: { message: `model not allowed: ${model}` } }, { status: 400 });
  const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(parsed.body ?? {}),
  });
  // Pass Google's status and body straight through: the client already handles 429 / 503 / 404.
  return new Response(await upstream.text(), { status: upstream.status, headers: { 'Content-Type': 'application/json' } });
}
