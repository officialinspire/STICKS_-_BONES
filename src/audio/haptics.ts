/** Optional haptics with feature detection. Only public events trigger them. */
export type HapticCue = 'place' | 'knock' | 'domino';

const PATTERNS: Record<HapticCue, number | number[]> = { place: 12, knock: [18, 60, 18], domino: [30, 50, 60] };

export function hapticsSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

export function haptic(cue: HapticCue, enabled: boolean): boolean {
  if (!enabled || !hapticsSupported()) return false;
  try {
    return navigator.vibrate(PATTERNS[cue]);
  } catch {
    return false;
  }
}
