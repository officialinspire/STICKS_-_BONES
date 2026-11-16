/**
 * Player preferences (per device). Stored in localStorage when available; the
 * game works identically without storage. Nothing here affects rules or timing.
 */
export type MotionPref = 'system' | 'reduce' | 'full';
export type AiSpeed = 'relaxed' | 'normal' | 'quick';

export interface Settings {
  /** Cousin may swear ("Fuck that…"); off uses the clean wording ("Forget that…"). */
  readonly explicitLanguage: boolean;
  /** Cousin's contextual banter; off keeps only the factual line. */
  readonly banter: boolean;
  readonly motion: MotionPref;
  /** Host gesture animation (the slam). */
  readonly hostAnimation: boolean;
  /** Presentation-only thinking delay for computer players. */
  readonly aiSpeed: AiSpeed;
}

export const DEFAULT_SETTINGS: Settings = { explicitLanguage: true, banter: true, motion: 'system', hostAnimation: true, aiSpeed: 'normal' };
export const SETTINGS_KEY = 'sticks-and-bones.settings';

export interface SettingsStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export function loadSettings(store: SettingsStore | null): Settings {
  try {
    const raw = store?.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const p = JSON.parse(raw) as Partial<Settings>;
    return {
      explicitLanguage: typeof p.explicitLanguage === 'boolean' ? p.explicitLanguage : DEFAULT_SETTINGS.explicitLanguage,
      banter: typeof p.banter === 'boolean' ? p.banter : DEFAULT_SETTINGS.banter,
      motion: p.motion === 'reduce' || p.motion === 'full' || p.motion === 'system' ? p.motion : DEFAULT_SETTINGS.motion,
      hostAnimation: typeof p.hostAnimation === 'boolean' ? p.hostAnimation : DEFAULT_SETTINGS.hostAnimation,
      aiSpeed: p.aiSpeed === 'relaxed' || p.aiSpeed === 'quick' || p.aiSpeed === 'normal' ? p.aiSpeed : DEFAULT_SETTINGS.aiSpeed,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(store: SettingsStore | null, s: Settings): void {
  try {
    store?.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: keep in memory only */
  }
}

/** Whether motion should be reduced, honouring the system preference when set to 'system'. */
export function reduceMotion(s: Settings, systemPrefersReduced: boolean): boolean {
  return s.motion === 'reduce' || (s.motion === 'system' && systemPrefersReduced);
}

/** Presentation delay multiplier for computer "thinking". Never changes decisions or rules. */
export const AI_SPEED_FACTOR: Record<AiSpeed, number> = { relaxed: 1.5, normal: 1, quick: 0.45 };
