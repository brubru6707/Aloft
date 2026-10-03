import * as Speech from 'expo-speech';
import { UI } from '../config';

/**
 * Single entry point for speech (expo-speech). Callers only ever use speak(text).
 */
let lastText = '';
let lastAt = 0;

export function speak(text: string): void {
  // Debounce identical phrases that fire in quick succession.
  const now = performance.now();
  if (text === lastText && now - lastAt < UI.speechDebounceMs) return;
  lastText = text; lastAt = now;
  try {
    Speech.stop();
    Speech.speak(text, { rate: UI.speechRate, pitch: UI.speechPitch, volume: UI.speechVolume });
  } catch {
    /* speech is best-effort */
  }
}
