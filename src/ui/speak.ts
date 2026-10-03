/**
 * Single entry point for speech. Swap the body for ElevenLabs (or anything else) later;
 * callers only ever use speak(text).
 */
let lastText = '';
let lastAt = 0;

export function speak(text: string): void {
  // Debounce identical phrases that fire in quick succession.
  const now = performance.now();
  if (text === lastText && now - lastAt < 400) return;
  lastText = text; lastAt = now;

  if (!('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.15;
    u.pitch = 1.0;
    u.volume = 0.9;
    window.speechSynthesis.speak(u);
  } catch {
    /* speech is best-effort */
  }
}
