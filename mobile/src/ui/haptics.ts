import * as Haptics from 'expo-haptics';

/** Haptic cues (best-effort; silently ignored where unsupported). */
export function hapticModeChange(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}
export function hapticFlyState(): void {
  Haptics.selectionAsync().catch(() => {});
}
export function hapticConnected(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
export function hapticError(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
}
