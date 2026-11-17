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
 *   - The user's mute and levels are never undone by resume, focus, profiles or cues.
 *   - Silent caption changes never duck the music (there are no authored speech recordings).
 */
import type { AudioSettings } from '../app/settings';
import type { Scheduler } from '../app/session';
import { PROFILES, QUICK_PLAY_BED, type StoryProfileId } from './profiles';
import { ALL_SAMPLES, MOTIF, VARIANTS, type BedId } from './sounds';

export type Scene = 'init' | 'intro' | 'menu' | 'story' | 'gameplay' | 'paused' | 'results';
export type Bus = 'music' | 'sfx' | 'voice' | 'ambience';
export type TrackId = 'menu' | 'gameplay';
export type SfxId = 'select' | 'back' | 'confirm' | 'invalid' | 'pickup' | 'slide' | 'place' | 'slam' | 'shuffle' | 'draw' | 'knock' | 'tap';
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
 *   whisper / speaker CAPTION ONLY: no voice recording has been supplied and none is impersonated
 */
export type StoryCue = 'knock-three' | 'knock-beyond' | 'knock-motif' | 'knock-motif-soft' | 'knock-one' | 'water' | 'surf' | 'dinner' | 'ambience-off' | 'whisper' | 'speaker';
/** Cues that only change the mix (safe to replay when a saved scene resumes). Everything else is a one-shot. */
export const STATE_CUES: ReadonlySet<StoryCue> = new Set(['ambience-off']);
export const CAPTION_ONLY_CUES: ReadonlySet<StoryCue> = new Set(['whisper', 'speaker']);

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
  onError(id: TrackId, cb: () => void): void;
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
export const SFX_LIMIT: Readonly<Record<SfxId, number>> = { select: 2, back: 1, confirm: 1, invalid: 1, pickup: 2, slide: 2, place: 3, slam: 1, shuffle: 1, draw: 2, knock: 2, tap: 2 };

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
  slide: { gain: 0.5, db: 1.5, rate: 0.03, synth: 'draw' },
  place: { gain: 0.8, db: 1.5, rate: 0.03, synth: 'place' },
  slam: { gain: 0.95, db: 1, rate: 0.02, synth: 'slam' },
  shuffle: { gain: 0.6, db: 1, rate: 0.02, synth: 'draw' },
  draw: { gain: 0.62, db: 1.5, rate: 0.03, synth: 'draw' },
  knock: { gain: 0.75, db: 1, rate: 0.02, synth: 'knock' },
  tap: { gain: 0.35, db: 0.8, rate: 0.01, synth: 'tap' },
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
  #swell = false;
  #lastBed: { bed: BedId | null; level: number } = { bed: null, level: 0 };
  #samplesRequested = false;
  #lastVariant = new Map<SfxId, number>();
  #rng = 0x2545f491;
  readonly stats = { musicStarts: 0, staleDropped: 0, playRejected: 0, sfxPlayed: 0, sfxDropped: 0, cuesPlayed: 0, cuesCancelled: 0, cuesCaptionOnly: 0, cuesRefused: 0 };

  constructor(d: ManagerDeps) {
    this.#b = d.backend;
    this.#sched = d.scheduler;
    this.#levels = d.levels;
    this.#gap = d.gapSec;
    for (const id of ['menu', 'gameplay'] as TrackId[]) {
      this.#b.onEnded(id, () => this.#onEnded(id));
      this.#b.onError(id, () => this.#onError(id));
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
    return t !== null && this.#playing === null && !this.#broken.has(t) && this.#b.hasTrack(t);
  }
  activeSfx(): number {
    return this.#active.length;
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
        const v = this.#rand() < 0.5 ? 'water-drop-1' : 'water-drop-2';
        return [{ sample: v, synth: 'tap', gain: 0.6, rate: 1 + (this.#rand() * 2 - 1) * 0.03, delay: 0 }];
      }
      case 'dinner':
        return [{ sample: 'glass-1', synth: 'tap', gain: 0.5, rate: 1, delay: 0 }];
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
    if (mix.sfx && !this.#samplesRequested) {
      this.#samplesRequested = true;
      this.#b.preloadSamples(ALL_SAMPLES);
    }
    this.#applyBed(BED_FADE_SEC);
    // An old track is still fading out: its timer will re-apply the then-current scene.
    if (this.#fadingOut) return;
    const want = mix.track && this.#b.hasTrack(mix.track) && !this.#broken.has(mix.track) ? mix.track : null;
    const cur = this.#playing;
    if (cur && cur === want) {
      this.#b.fade(cur, mix.duck, 0.5);
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

  #onError(id: TrackId): void {
    this.#broken.add(id);
    if (this.#playing === id) this.#playing = null;
  }
}
