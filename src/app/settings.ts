/**
 * Player preferences (per device). Stored in localStorage when available; the
 * game works identically without storage. Nothing here affects rules or timing.
 */
export type MotionPref = 'system' | 'reduce' | 'full';
export type AiSpeed = 'relaxed' | 'normal' | 'quick';

export interface AudioSettings {
  /** 0..1 each. */
  readonly master: number;
  readonly music: number;
  readonly sfx: number;
  readonly voice: number;
  readonly ambience: number;
  readonly muted: boolean;
  /** Optional quiet patio ambience during play. */
  readonly ambienceOn: boolean;
}

export const DEFAULT_AUDIO: AudioSettings = { master: 0.8, music: 0.6, sfx: 0.8, voice: 0.9, ambience: 0.5, muted: false, ambienceOn: false };

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
  readonly audio: AudioSettings;
  /** Short vibrations on supported devices. */
  readonly haptics: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  explicitLanguage: true,
  banter: true,
  motion: 'system',
  hostAnimation: true,
  aiSpeed: 'normal',
  audio: DEFAULT_AUDIO,
  haptics: true,
};

const level = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);

function loadAudio(a: unknown): AudioSettings {
  if (typeof a !== 'object' || a === null) return DEFAULT_AUDIO;
  const p = a as Partial<AudioSettings>;
  return {
    master: level(p.master, DEFAULT_AUDIO.master),
    music: level(p.music, DEFAULT_AUDIO.music),
    sfx: level(p.sfx, DEFAULT_AUDIO.sfx),
    voice: level(p.voice, DEFAULT_AUDIO.voice),
    ambience: level(p.ambience, DEFAULT_AUDIO.ambience),
    muted: typeof p.muted === 'boolean' ? p.muted : DEFAULT_AUDIO.muted,
    ambienceOn: typeof p.ambienceOn === 'boolean' ? p.ambienceOn : DEFAULT_AUDIO.ambienceOn,
  };
}
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
      audio: loadAudio(p.audio),
      haptics: typeof p.haptics === 'boolean' ? p.haptics : DEFAULT_SETTINGS.haptics,
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
