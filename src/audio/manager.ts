/**
 * One audio manager for the whole app. It owns exclusive SCENES, per-story-scene PROFILES,
 * user-gesture unlock, levels/mute, fades, SFX variations and instance limits, the ambience
 * bed, scheduled story cues, missing-file handling and focus/visibility, on top of a small
 * Backend interface (Web Audio in the browser, a fake in tests).
 *
 * Invariants:
 *   - At most ONE music track is audible at a time. Track changes fade the old
 *     one out and pause it BEFORE the next one starts (no crossfade overlap).
 *   - Ambience beds live on their own bus and may cross-fade gently; at most one bed is wanted.
 *   - Every async continuation (fade timers, play() promises, restarts) carries
 *     the scene token it was started under and is dropped if the token moved.
 *   - Story cues are scheduled on the audio clock, never on timers, and every cue voice that has
 *     not finished is cancelled on the next beat, a skip, a scene/profile change, reset or
 *     backgrounding: no delayed ghost knocks.
 *   - play() rejections and missing files never throw: the scene goes quiet (or, for an SFX whose
 *     sample is not decoded yet, the synthesized placeholder plays).
 *   - Failures are told apart: ABSENT files and BROKEN files are never retried; TRANSIENT failures
 *     (offline, network, temporary HTTP status) are retried by recover() after a user gesture or a
 *     reconnection, at most MAX_RECOVERIES times per track, with a cooldown. Recovery only re-applies
 *     the CURRENT scene's music and bed: no sound effect or story cue is ever queued for replay.
 *   - The user's mute and levels are never undone by resume, focus, profiles or cues.
 *   - Silent caption changes never duck the music (there are no authored speech recordings).
 */
import type { AudioSettings } from '../app/settings';
import type { Scheduler } from '../app/session';
import { PROFILES, QUICK_PLAY_BED, type StoryProfileId } from './profiles';
import { MOTIF, samplesFor, VARIANTS, type BedId } from './sounds';
import { TRACK_IDS, type MusicTrackId } from '../assets/audio-manifest';

export type Scene = 'init' | 'intro' | 'menu' | 'story' | 'gameplay' | 'paused' | 'results';
export type Bus = 'music' | 'sfx' | 'voice' | 'ambience';
export type TrackId = MusicTrackId;
/** Short musical result cues (decoded buffers on the music bus): a hand won, or lost / blocked. */
export type ResultCue = 'win' | 'other';
export const RESULT_CUE_SAMPLE: Readonly<Record<ResultCue, string>> = { win: 'result-win', other: 'result-other' };
/** Story accent samples (beside the knock motif): cave water drops and the terrace's glassware. */
export const ACCENT_SAMPLES = { water: ['water-drop-1', 'water-drop-2'], dinner: ['glass-1'] } as const;
/** How long a result cue holds the music down (its longest cue is 1.95 s; the duck releases after it). */
export const RESULT_DUCK_SEC = 2.2;
/** The track's level under a result cue (× the scene's duck). */
export const RESULT_DUCK = 0.25;
export type SfxId = 'select' | 'back' | 'confirm' | 'invalid' | 'pickup' | 'place' | 'slam' | 'shuffle' | 'draw' | 'knock';
/** Synthesized placeholder voices: used only while a sample is still decoding or if its file is missing. */
export type SynthId = 'place' | 'knock' | 'draw' | 'slam' | 'tap' | 'thud';
/**
 * Story scene-audio cues, raised by the SceneDirector from exact stage directions.
 *   knock-three      "Three measured knocks."                    three matched knocks, evenly spaced
 *   knock-beyond     "A fourth knock comes from beyond the light." the answering knock alone
 *   knock-motif      "Three knocks. A fourth answers…"           three knocks, a pause, the answer
 *   knock-motif-soft  the same motif, lighter (taps under a bench, knocks in a domino box)
 *   knock-one        a single quiet knock (the gate; "One quiet knock, no answer demanded")
 *   water / dinner   small accents; surf swells the promenade bed for that beat
 *   ambience-off     the bed fades away for the rest of the scene (state, replayed on resume)
 *   music-off        the scene's music fades away for the rest of the scene (state, replayed on resume)
 *   whisper / speaker CAPTION ONLY: no voice recording has been supplied and none is impersonated
 */
export type StoryCue = 'knock-three' | 'knock-beyond' | 'knock-motif' | 'knock-motif-soft' | 'knock-one' | 'water' | 'surf' | 'dinner' | 'ambience-off' | 'music-off' | 'whisper' | 'speaker';
/** Cues that only change the mix (safe to replay when a saved scene resumes). Everything else is a one-shot. */
export const STATE_CUES: ReadonlySet<StoryCue> = new Set(['ambience-off', 'music-off']);
export const CAPTION_ONLY_CUES: ReadonlySet<StoryCue> = new Set(['whisper', 'speaker']);

/** Why a music file failed: gone for good (absent), unusable (broken), or maybe only for now (transient). */
export type MediaFailure = 'absent' | 'transient' | 'broken';
/** Recovery attempts per music track after transient failures. */
export const MAX_RECOVERIES = 3;
/** Minimum time between two recovery passes (gestures and reconnections can come in bursts). */
export const RECOVER_COOLDOWN_MS = 4000;

export interface SfxHandle {
  stop(): void;
  /** Called once when the sound finishes or is stopped. */
  onEnded(cb: () => void): void;
}

/** One sound to play: a decoded sample (or its synth placeholder), gain, playback rate and start delay on the audio clock. */
export interface Voice {
  readonly sample: string | null;
  readonly synth: SynthId;
  readonly gain: number;
  readonly rate: number;
  readonly delay: number;
  /** Which bus it plays on (default sfx). Result cues are music. */
  readonly bus?: 'sfx' | 'music';
  /** false: if the sample isn't decoded, play nothing (never a synthesized stand-in for music). */
  readonly placeholder?: boolean;
}

export interface AudioBackend {
  /** Create/resume the audio context. Must be called from a user gesture. */
  unlock(): Promise<boolean>;
  suspend(): void;
  resume(): Promise<boolean>;
  setGain(target: 'master' | Bus, value: number, rampSec: number): void;
  hasTrack(id: TrackId): boolean;
  load(id: TrackId, preload: 'metadata' | 'auto'): void;
  /** Resolve true when playback actually starts; false on rejection or missing/broken file. */
  play(id: TrackId, fromStart: boolean): Promise<boolean>;
  pause(id: TrackId): void;
  /** Per-track gain fade (0..1, already including loudness normalisation). */
  fade(id: TrackId, to: number, sec: number): void;
  onEnded(id: TrackId, cb: () => void): void;
  /** The track failed. `kind` is omitted by backends that can't tell (treated as broken). */
  onError(id: TrackId, cb: (kind?: MediaFailure) => void): void;
  /** Clear a recoverable media error so the next play() loads the file afresh. */
  resetTrack?(id: TrackId): void;
  /** Re-fetch samples/beds that failed transiently (bounded per file). True if anything was retried. */
  retryTransient?(): boolean;
  /** Fetch and decode short samples (after unlock). Missing or broken files are remembered and skipped. */
  preloadSamples(ids: readonly string[]): void;
  playSfx(v: Voice): SfxHandle | null;
  /** The wanted ambience bed (null = none) at a level, cross-faded over fadeSec on the ambience bus. */
  ambience(bed: BedId | null, level: number, fadeSec: number): void;
}

interface SceneSpec {
  readonly track: TrackId | null;
  /** Multiplier on the track's level (ducking). */
  readonly duck: number;
  readonly sfx: boolean;
  /** Multiplier on the scene's bed level (0 = no bed). */
  readonly bed: number;
}

export const SCENES: Readonly<Record<Scene, SceneSpec>> = {
  init: { track: null, duck: 0, sfx: false, bed: 0 },
  // The studio credit plays its own soundtrack: no music, no SFX, no ambience.
  intro: { track: null, duck: 0, sfx: false, bed: 0 },
  menu: { track: 'menu', duck: 1, sfx: true, bed: 0 },
  // Story dialogue: the active profile names the track (often none) and the bed.
  story: { track: null, duck: 1, sfx: true, bed: 1 },
  gameplay: { track: 'gameplay', duck: 1, sfx: true, bed: 1 },
  paused: { track: 'gameplay', duck: 0.35, sfx: false, bed: 0 },
  results: { track: 'gameplay', duck: 0.7, sfx: true, bed: 0.6 },
};

export const FADE_OUT_SEC = 0.45;
export const FADE_IN_SEC = 0.9;
export const BED_FADE_SEC = 2.4;
export const MAX_SFX = 6;
export const SFX_LIMIT: Readonly<Record<SfxId, number>> = { select: 2, back: 1, confirm: 1, invalid: 1, pickup: 2, place: 3, slam: 1, shuffle: 1, draw: 2, knock: 2 };

interface SfxStyle {
  readonly gain: number;
  /** ± variation, in dB and as a fraction of playback rate (restrained). */
  readonly db: number;
  readonly rate: number;
  readonly synth: SynthId;
}
const STYLE: Readonly<Record<SfxId, SfxStyle>> = {
  select: { gain: 0.42, db: 0.8, rate: 0.01, synth: 'tap' },
  back: { gain: 0.42, db: 0.8, rate: 0.01, synth: 'tap' },
  confirm: { gain: 0.5, db: 0.8, rate: 0.01, synth: 'tap' },
  invalid: { gain: 0.38, db: 0.5, rate: 0, synth: 'tap' },
  pickup: { gain: 0.55, db: 1.5, rate: 0.03, synth: 'tap' },
  place: { gain: 0.8, db: 1.5, rate: 0.03, synth: 'place' },
  slam: { gain: 0.95, db: 1, rate: 0.02, synth: 'slam' },
  shuffle: { gain: 0.6, db: 1, rate: 0.02, synth: 'draw' },
  draw: { gain: 0.62, db: 1.5, rate: 0.03, synth: 'draw' },
  knock: { gain: 0.75, db: 1, rate: 0.02, synth: 'knock' },
};

export interface ManagerDeps {
  backend: AudioBackend;
  scheduler: Scheduler;
  levels: AudioSettings;
  /** Restart gap after a track's composed ending (seconds), by track. */
  gapSec: Readonly<Record<TrackId, number>>;
}

interface Mix {
  readonly track: TrackId | null;
  readonly duck: number;
  readonly bed: BedId | null;
  readonly bedLevel: number;
  readonly sfx: boolean;
}

export class AudioManager {
  #b: AudioBackend;
  #sched: Scheduler;
  #levels: AudioSettings;
  #gap: Readonly<Record<TrackId, number>>;
  #scene: Scene = 'init';
  #profile: StoryProfileId | null = null;
  #token = 0;
  #unlocked = false;
  #hidden = false;
  /** Track currently audible (or fading in). */
  #playing: TrackId | null = null;
  #broken = new Set<TrackId>();
  /** Tracks down for a transient reason (not played until recover()), and attempts used per track. */
  #down = new Set<TrackId>();
  #recoveries = new Map<TrackId, number>();
  #recoverCooldown = false;
  #timers = new Set<unknown>();
  /**
   * A track still fading out (audible until its fade timer pauses it). Nothing new
   * starts while it exists, and its timer is never cancelled by scene changes —
   * otherwise a quick second scene change would leave it playing under the next track.
   */
  #fadingOut: { id: TrackId; timer: unknown } | null = null;
  #active: { id: SfxId; h: SfxHandle }[] = [];
  /** Voices of the current story cue (scheduled on the audio clock; cancelled on the next beat). */
  #cueVoices: SfxHandle[] = [];
  /** Story mix state for the current beat/scene. */
  #bedOff = false;
  #musicOff = false;
  #swell = false;
  /** The result cue sounding now (one at most), and its duck. */
  #stinger: SfxHandle | null = null;
  #ducked = false;
  /** The duck's own release timer (scene changes clear #later timers; this one belongs to the cue). */
  #duckTimer: unknown = null;
  #lastBed: { bed: BedId | null; level: number } = { bed: null, level: 0 };
  #samplesRequested = new Set<'ui' | 'table' | 'story'>();
  #lastVariant = new Map<SfxId, number>();
  #rng = 0x2545f491;
  readonly stats = { musicStarts: 0, staleDropped: 0, playRejected: 0, sfxPlayed: 0, sfxDropped: 0, cuesPlayed: 0, cuesCancelled: 0, cuesCaptionOnly: 0, cuesRefused: 0, resultCues: 0, resultCuesWithheld: 0 };

  constructor(d: ManagerDeps) {
    this.#b = d.backend;
    this.#sched = d.scheduler;
    this.#levels = d.levels;
    this.#gap = d.gapSec;
    for (const id of TRACK_IDS) {
      this.#b.onEnded(id, () => this.#onEnded(id));
      this.#b.onError(id, (kind) => this.#onError(id, kind ?? 'broken'));
    }
  }

  get scene(): Scene {
    return this.#scene;
  }
  get profile(): StoryProfileId | null {
    return this.#profile;
  }
  get unlocked(): boolean {
    return this.#unlocked;
  }
  get playing(): TrackId | null {
    return this.#playing;
  }
  get levels(): AudioSettings {
    return this.#levels;
  }
  /** The bed the manager last asked for (null = none). */
  get bed(): { bed: BedId | null; level: number } {
    return this.#lastBed;
  }
  /** True when the current scene wants music that is not playing (a later gesture may start it). */
  get wantsMusic(): boolean {
    const t = this.#mix().track;
    return t !== null && this.#playing === null && !this.#broken.has(t) && !this.#down.has(t) && this.#b.hasTrack(t);
  }
  activeSfx(): number {
    return this.#active.length;
  }
  /** Which sounds are active (tests: a reset leaves only what the new state itself started). */
  activeSfxIds(): SfxId[] {
    return this.#active.map((a) => a.id);
  }
  pendingCueVoices(): number {
    return this.#cueVoices.length;
  }

  /** Call from the first user gesture (and again after a gesture if resume was refused). */
  async unlock(): Promise<boolean> {
    const ok = await this.#b.unlock();
    if (!ok) return false;
    const was = this.#unlocked;
    this.#unlocked = true;
    this.#applyLevels(0);
    if (!was || !this.#playing) this.#apply(this.#token);
    return true;
  }

  /** Why a track is not playable right now (null = fine). Debug and tests. */
  failure(id: TrackId): MediaFailure | null {
    return this.#broken.has(id) ? 'broken' : this.#down.has(id) ? 'transient' : null;
  }

  /**
   * After a user gesture or a reconnection: retry what failed for a temporary reason. Bounded (per track
   * attempts, cooldown between passes) and current-scene only: the music and bed follow the scene on screen
   * now; nothing that was meant to sound earlier is replayed. Returns true if anything was retried.
   */
  recover(): boolean {
    if (this.#recoverCooldown) return false;
    let any = false;
    for (const id of [...this.#down]) {
      const n = this.#recoveries.get(id) ?? 0;
      this.#down.delete(id);
      if (n >= MAX_RECOVERIES) {
        this.#broken.add(id); // out of attempts: quiet for the rest of the session
        continue;
      }
      this.#recoveries.set(id, n + 1);
      this.#b.resetTrack?.(id);
      any = true;
    }
    if (this.#b.retryTransient?.()) any = true;
    if (!any) return false;
    this.#recoverCooldown = true;
    this.#sched.set(() => (this.#recoverCooldown = false), RECOVER_COOLDOWN_MS);
    if (this.#unlocked && !this.#hidden) {
      this.#lastBed = { bed: null, level: 0 }; // let the current bed be asked for again (it may have failed)
      this.#apply(this.#token);
    }
    return true;
  }

  /** Warm up a track's download without playing it (keeps startup light). */
  preload(id: TrackId, how: 'metadata' | 'auto' = 'auto'): void {
    if (this.#b.hasTrack(id)) this.#b.load(id, how);
  }

  setLevels(levels: AudioSettings): void {
    const ambienceChanged = levels.ambienceOn !== this.#levels.ambienceOn;
    this.#levels = levels;
    this.#applyLevels(0.15);
    if (ambienceChanged && this.#unlocked && !this.#hidden) this.#applyBed(0.6);
  }

  setScene(scene: Scene): void {
    if (scene === this.#scene) return;
    this.#scene = scene;
    const token = ++this.#token;
    this.cancelCues();
    // A result cue belongs to the table: leaving it (menu, story, intro) stops the cue; results ⇄ gameplay keep it.
    if (scene !== 'gameplay' && scene !== 'results' && scene !== 'paused') this.stopStinger();
    if (!SCENES[scene].sfx) this.stopAllSfx();
    if (this.#unlocked && !this.#hidden) this.#apply(token);
  }

  /**
   * Which story scene's profile applies (null = none: Quick Play defaults). Changing it cancels
   * cues and resets the scene's mix state; the music/bed follow at once if audio is live.
   */
  setStoryProfile(id: StoryProfileId | null): void {
    if (id === this.#profile) return;
    this.#profile = id;
    this.#bedOff = false;
    this.#musicOff = false;
    this.#swell = false;
    this.cancelCues();
    const token = ++this.#token;
    if (this.#unlocked && !this.#hidden) this.#apply(token);
  }

  /** A new story beat is on screen: anything from the previous beat that is still sounding or scheduled stops. */
  beat(): void {
    this.cancelCues();
    if (this.#swell) {
      this.#swell = false;
      if (this.#unlocked && !this.#hidden) this.#applyBed(1.2);
    }
  }

  /** Tab hidden / app backgrounded: silence everything, remember nothing private. */
  setHidden(hidden: boolean): void {
    if (hidden === this.#hidden) return;
    this.#hidden = hidden;
    const token = ++this.#token;
    if (hidden) {
      this.#clearTimers();
      this.#finishFadeOut();
      this.stopAllSfx();
      this.cancelCues();
      this.stopStinger();
      if (this.#playing) this.#b.pause(this.#playing);
      this.#playing = null;
      this.#b.ambience(null, 0, 0);
      this.#lastBed = { bed: null, level: 0 };
      this.#b.suspend();
      return;
    }
    if (!this.#unlocked) return;
    void this.#b.resume().then((ok) => {
      if (token !== this.#token) return void this.stats.staleDropped++;
      if (ok) this.#apply(token);
      // If the browser refuses, the UI calls unlock() again on the next gesture.
    });
  }

  #canSound(): boolean {
    return this.#unlocked && !this.#hidden && SCENES[this.#scene].sfx && !this.#levels.muted && this.#levels.sfx > 0 && this.#levels.master > 0;
  }

  playSfx(id: SfxId): boolean {
    if (!this.#canSound()) return false;
    const same = this.#active.filter((a) => a.id === id);
    if (same.length >= SFX_LIMIT[id] || this.#active.length >= MAX_SFX) {
      this.stats.sfxDropped++;
      return false;
    }
    const h = this.#b.playSfx(this.#voice(id));
    if (!h) return false;
    const entry = { id, h };
    this.#active.push(entry);
    h.onEnded(() => (this.#active = this.#active.filter((a) => a !== entry)));
    this.stats.sfxPlayed++;
    return true;
  }

  /** Story cue hook. Mute, levels and the scene's SFX policy still apply; the previous cue is cancelled first. */
  cue(c: StoryCue): boolean {
    if (CAPTION_ONLY_CUES.has(c)) {
      this.stats.cuesCaptionOnly++;
      return false;
    }
    if (c === 'ambience-off' || c === 'surf') {
      if (c === 'ambience-off') this.#bedOff = true;
      else this.#swell = true;
      if (this.#unlocked && !this.#hidden) this.#applyBed(c === 'ambience-off' ? 3 : 1.5);
      return true;
    }
    if (c === 'music-off') {
      // The scene's music fades away (normal track change path: one track, faded out before anything else).
      if (this.#musicOff) return true;
      this.#musicOff = true;
      if (this.#unlocked && !this.#hidden) this.#apply(++this.#token);
      return true;
    }
    this.cancelCues();
    if (!this.#canSound()) {
      this.stats.cuesRefused++;
      return false;
    }
    const voices = this.#cueVoices_(c);
    for (const v of voices) {
      const h = this.#b.playSfx(v);
      if (!h) continue;
      this.#cueVoices.push(h);
      h.onEnded(() => (this.#cueVoices = this.#cueVoices.filter((x) => x !== h)));
    }
    if (this.#cueVoices.length) this.stats.cuesPlayed++;
    return this.#cueVoices.length > 0;
  }

  /** Stop every story cue voice that is scheduled or still sounding. */
  cancelCues(): void {
    if (!this.#cueVoices.length) return;
    const all = this.#cueVoices;
    this.#cueVoices = [];
    this.stats.cuesCancelled += all.length;
    for (const h of all) h.stop();
  }

  /**
   * A short musical result cue (a hand won / lost or blocked) at a table. It is music, so it plays on the music
   * bus (the player's music level and mute apply) and ducks the current track instead of adding a second song;
   * it is never synthesized (an undecoded or missing cue plays nothing) and never queued for later. One at a
   * time; cancelled by reset, backgrounding, or leaving the table.
   */
  resultCue(kind: ResultCue): boolean {
    const L = this.#levels;
    if (!this.#unlocked || this.#hidden || L.muted || L.music <= 0 || L.master <= 0) return false;
    if (this.#scene !== 'gameplay' && this.#scene !== 'results') return false;
    // A serious story hand (its profile says so) ends without a musical flourish.
    if (this.#profile && !PROFILES[this.#profile].resultCue) {
      this.stats.resultCuesWithheld++;
      return false;
    }
    this.stopStinger();
    const h = this.#b.playSfx({ sample: RESULT_CUE_SAMPLE[kind], synth: 'tap', gain: 1, rate: 1, delay: 0, bus: 'music', placeholder: false });
    if (!h) return false;
    this.#stinger = h;
    h.onEnded(() => {
      if (this.#stinger === h) this.#stinger = null;
    });
    // Duck the track under the cue, then let the mix return to the scene's own level.
    this.#ducked = true;
    if (this.#playing) this.#b.fade(this.#playing, this.#mix().duck * RESULT_DUCK, 0.12);
    this.#duckTimer = this.#sched.set(() => {
      this.#duckTimer = null;
      this.#unduck();
    }, RESULT_DUCK_SEC * 1000);
    this.stats.resultCues++;
    return true;
  }

  /** Stop the result cue (if any) and release its duck. */
  stopStinger(): void {
    const h = this.#stinger;
    this.#stinger = null;
    h?.stop();
    if (this.#ducked) this.#unduck();
  }

  #unduck(): void {
    if (this.#duckTimer !== null) this.#sched.clear(this.#duckTimer);
    this.#duckTimer = null;
    this.#ducked = false;
    if (this.#playing && this.#unlocked && !this.#hidden) this.#b.fade(this.#playing, this.#mix().duck, 0.6);
  }

  stopAllSfx(): void {
    const all = this.#active;
    this.#active = [];
    for (const a of all) a.h.stop();
  }

  /** Reset (restart/leave): cancel pending fades/restarts, cues and SFX. Music follows the next scene. */
  reset(): void {
    this.#token++;
    this.#clearTimers();
    this.stopAllSfx();
    this.cancelCues();
    this.stopStinger();
  }

  // ---- internals ----------------------------------------------------------------

  /** The effective mix for the current scene + story profile + settings. */
  #mix(): Mix {
    const s = SCENES[this.#scene];
    const p = this.#profile ? PROFILES[this.#profile] : null;
    let track = s.track;
    let duck = s.duck;
    let bed: BedId | null = null;
    let level = 0;
    if (this.#scene === 'story') {
      track = p?.track ?? null;
      duck = p?.duck ?? 0;
      bed = p?.bed ?? null;
      level = p?.bedLevel ?? 0;
      if (this.#bedOff) bed = null;
      if (this.#musicOff) track = null;
      if (this.#swell) level = Math.min(1, level * 1.5);
    } else if (this.#scene === 'gameplay' || this.#scene === 'paused' || this.#scene === 'results') {
      if (p) {
        track = p.handTrack;
        duck = s.duck * p.handDuck;
        bed = p.bed;
        level = p.handBedLevel;
      } else {
        bed = QUICK_PLAY_BED.bed;
        level = QUICK_PLAY_BED.level;
      }
    }
    level *= s.bed;
    if (level <= 0 || !this.#levels.ambienceOn) bed = null;
    return { track, duck, bed, bedLevel: bed ? level : 0, sfx: s.sfx };
  }

  #rand(): number {
    let x = this.#rng;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.#rng = x >>> 0;
    return this.#rng / 0x100000000;
  }

  /** A matched variation of a sound: never the same file twice in a row, small gain/rate changes. */
  #voice(id: SfxId): Voice {
    const list = VARIANTS[id];
    let i = 0;
    if (list.length > 1) {
      const last = this.#lastVariant.get(id) ?? -1;
      i = Math.floor(this.#rand() * (list.length - 1));
      if (i >= last && last >= 0) i++;
    }
    this.#lastVariant.set(id, i);
    const st = STYLE[id];
    const db = (this.#rand() * 2 - 1) * st.db;
    const rate = 1 + (this.#rand() * 2 - 1) * st.rate;
    return { sample: list[i] ?? null, synth: st.synth, gain: st.gain * 10 ** (db / 20), rate, delay: 0 };
  }

  /** The exact voices of a story cue. Knock motifs are never varied: the same three knocks every time. */
  #cueVoices_(c: StoryCue): Voice[] {
    const knock = (sample: string, delay: number, gain: number): Voice => ({ sample, synth: 'thud', gain, rate: 1, delay });
    const three = (gain: number) => MOTIF.knocks.map((s, i) => knock(s, i * MOTIF.interval, gain));
    const answerAt = 2 * MOTIF.interval + MOTIF.answerGap;
    switch (c) {
      case 'knock-three':
        return three(0.85);
      case 'knock-beyond':
        return [knock(MOTIF.beyond, 0, 0.8)];
      case 'knock-motif':
        return [...three(0.85), knock(MOTIF.beyond, answerAt, 0.8)];
      case 'knock-motif-soft':
        return [...three(0.5), knock(MOTIF.beyond, answerAt, 0.55)];
      case 'knock-one':
        return [knock(MOTIF.knocks[0], 0, 0.5)];
      case 'water': {
        const v = ACCENT_SAMPLES.water[this.#rand() < 0.5 ? 0 : 1];
        return [{ sample: v, synth: 'tap', gain: 0.6, rate: 1 + (this.#rand() * 2 - 1) * 0.03, delay: 0 }];
      }
      case 'dinner':
        return [{ sample: ACCENT_SAMPLES.dinner[0], synth: 'tap', gain: 0.5, rate: 1, delay: 0 }];
      default:
        return [];
    }
  }

  #applyLevels(ramp: number): void {
    const L = this.#levels;
    this.#b.setGain('master', L.muted ? 0 : L.master, ramp);
    this.#b.setGain('music', L.music, ramp);
    this.#b.setGain('sfx', L.sfx, ramp);
    this.#b.setGain('voice', L.voice, ramp);
    this.#b.setGain('ambience', L.ambience, ramp);
  }

  #applyBed(fadeSec: number): void {
    const m = this.#mix();
    const next = { bed: m.bed, level: m.bedLevel };
    if (next.bed === this.#lastBed.bed && next.level === this.#lastBed.level) return;
    this.#lastBed = next;
    this.#b.ambience(next.bed, next.level, fadeSec);
  }

  #later(token: number, sec: number, fn: () => void): void {
    const h = this.#sched.set(() => {
      this.#timers.delete(h);
      if (token !== this.#token) return void this.stats.staleDropped++;
      fn();
    }, sec * 1000);
    this.#timers.add(h);
  }

  #clearTimers(): void {
    for (const t of this.#timers) this.#sched.clear(t);
    this.#timers.clear();
  }

  /** Pause a pending fade-out now (tab hidden). */
  #finishFadeOut(): void {
    const f = this.#fadingOut;
    if (!f) return;
    this.#sched.clear(f.timer);
    this.#fadingOut = null;
    this.#b.pause(f.id);
  }

  /** Bring audio in line with the current scene. */
  #apply(token: number): void {
    this.#clearTimers();
    const mix = this.#mix();
    if (mix.sfx) {
      // Decode only what this scene can play (UI always; table sounds at a table; story accents in Story).
      const groups: ('ui' | 'table' | 'story')[] = ['ui', ...(this.#scene === 'story' ? (['story'] as const) : this.#scene === 'menu' ? [] : (['table'] as const))];
      for (const g of groups) if (!this.#samplesRequested.has(g)) {
        this.#samplesRequested.add(g);
        this.#b.preloadSamples(samplesFor(g));
      }
    }
    this.#applyBed(BED_FADE_SEC);
    // An old track is still fading out: its timer will re-apply the then-current scene.
    if (this.#fadingOut) return;
    const want = mix.track && this.#b.hasTrack(mix.track) && !this.#broken.has(mix.track) && !this.#down.has(mix.track) ? mix.track : null;
    const cur = this.#playing;
    if (cur && cur === want) {
      // A result cue is sounding: the track stays under it until the cue's own timer releases the duck.
      this.#b.fade(cur, this.#ducked ? mix.duck * RESULT_DUCK : mix.duck, 0.5);
      return;
    }
    if (cur) {
      // Fade out and stop the old track BEFORE starting anything new: never two music sources.
      this.#b.fade(cur, 0, FADE_OUT_SEC);
      this.#playing = null;
      const old = cur;
      const timer = this.#sched.set(() => {
        if (this.#fadingOut?.timer !== timer) return;
        this.#fadingOut = null;
        this.#b.pause(old); // always stopped, even if the scene moved on meanwhile
        if (token !== this.#token) this.stats.staleDropped++;
        // Start whatever the CURRENT scene wants (it may have changed during the fade).
        if (this.#unlocked && !this.#hidden) this.#apply(this.#token);
      }, FADE_OUT_SEC * 1000);
      this.#fadingOut = { id: old, timer };
      return;
    }
    if (want) this.#start(want, token, true);
  }

  #start(id: TrackId, token: number, fromStart: boolean): void {
    this.#playing = id;
    this.#b.fade(id, 0, 0);
    void this.#b.play(id, fromStart).then((ok) => {
      if (token !== this.#token || this.#playing !== id) {
        this.stats.staleDropped++;
        if (this.#playing !== id) this.#b.pause(id);
        return;
      }
      if (!ok) {
        this.stats.playRejected++;
        this.#playing = null;
        return;
      }
      this.stats.musicStarts++;
      this.#b.fade(id, this.#mix().duck, FADE_IN_SEC);
    });
  }

  #onEnded(id: TrackId): void {
    if (this.#playing !== id) return;
    // Composed ending reached: breathe, then start the song again (no assumed loop points).
    const token = this.#token;
    this.#playing = null;
    this.#later(token, this.#gap[id], () => {
      if (this.#mix().track === id && !this.#hidden && !this.#playing) this.#start(id, token, true);
    });
  }

  #onError(id: TrackId, kind: MediaFailure): void {
    if (this.#playing === id) this.#playing = null;
    if (kind === 'transient' && (this.#recoveries.get(id) ?? 0) < MAX_RECOVERIES) this.#down.add(id);
    else {
      this.#down.delete(id);
      this.#broken.add(id); // absent or broken: never retried
    }
  }
}
