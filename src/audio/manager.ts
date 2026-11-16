/**
 * One audio manager for the whole app. It owns exclusive SCENES, user-gesture
 * unlock, levels/mute, fades, SFX instance limits, missing-file handling and
 * focus/visibility, on top of a small Backend interface (Web Audio in the
 * browser, a fake in tests).
 *
 * Invariants:
 *   - At most ONE music track is audible at a time. Track changes fade the old
 *     one out and pause it BEFORE the next one starts (no crossfade overlap).
 *   - Every async continuation (fade timers, play() promises, restarts) carries
 *     the scene token it was started under and is dropped if the token moved.
 *   - play() rejections and missing files never throw: the scene goes quiet.
 *   - The user's mute is never undone by resume, focus or scene changes.
 */
import type { AudioSettings } from '../app/settings';
import type { Scheduler } from '../app/session';

export type Scene = 'init' | 'intro' | 'menu' | 'gameplay' | 'paused' | 'results';
export type Bus = 'music' | 'sfx' | 'voice' | 'ambience';
export type TrackId = 'menu' | 'gameplay';
export type SfxId = 'place' | 'knock' | 'draw' | 'slam' | 'tap';

export interface SfxHandle {
  stop(): void;
  /** Called once when the sound finishes or is stopped. */
  onEnded(cb: () => void): void;
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
  playSfx(id: SfxId): SfxHandle | null;
  ambience(on: boolean, fadeSec: number): void;
}

interface SceneSpec {
  readonly track: TrackId | null;
  /** Multiplier on the track's level (ducking). */
  readonly duck: number;
  readonly sfx: boolean;
  readonly ambience: boolean;
}

export const SCENES: Readonly<Record<Scene, SceneSpec>> = {
  init: { track: null, duck: 0, sfx: false, ambience: false },
  // The studio credit plays its own soundtrack: no music, no SFX, no ambience.
  intro: { track: null, duck: 0, sfx: false, ambience: false },
  menu: { track: 'menu', duck: 1, sfx: true, ambience: false },
  gameplay: { track: 'gameplay', duck: 1, sfx: true, ambience: true },
  paused: { track: 'gameplay', duck: 0.35, sfx: false, ambience: false },
  results: { track: 'gameplay', duck: 0.7, sfx: true, ambience: true },
};

export const FADE_OUT_SEC = 0.45;
export const FADE_IN_SEC = 0.9;
export const MAX_SFX = 6;
export const SFX_LIMIT: Readonly<Record<SfxId, number>> = { place: 3, knock: 2, draw: 2, slam: 1, tap: 2 };

export interface ManagerDeps {
  backend: AudioBackend;
  scheduler: Scheduler;
  levels: AudioSettings;
  /** Restart gap after a track's composed ending (seconds), by track. */
  gapSec: Readonly<Record<TrackId, number>>;
}

export class AudioManager {
  #b: AudioBackend;
  #sched: Scheduler;
  #levels: AudioSettings;
  #gap: Readonly<Record<TrackId, number>>;
  #scene: Scene = 'init';
  #token = 0;
  #unlocked = false;
  #hidden = false;
  /** Track currently audible (or fading in). */
  #playing: TrackId | null = null;
  #broken = new Set<TrackId>();
  #timers = new Set<unknown>();
  #active: { id: SfxId; h: SfxHandle }[] = [];
  readonly stats = { musicStarts: 0, staleDropped: 0, playRejected: 0, sfxPlayed: 0, sfxDropped: 0 };

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
  get unlocked(): boolean {
    return this.#unlocked;
  }
  get playing(): TrackId | null {
    return this.#playing;
  }
  get levels(): AudioSettings {
    return this.#levels;
  }
  activeSfx(): number {
    return this.#active.length;
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
    if (ambienceChanged && this.#unlocked && !this.#hidden) this.#b.ambience(SCENES[this.#scene].ambience && levels.ambienceOn, 0.6);
  }

  setScene(scene: Scene): void {
    if (scene === this.#scene) return;
    this.#scene = scene;
    const token = ++this.#token;
    if (!SCENES[scene].sfx) this.stopAllSfx();
    if (this.#unlocked && !this.#hidden) this.#apply(token);
  }

  /** Tab hidden / app backgrounded: silence everything, remember nothing private. */
  setHidden(hidden: boolean): void {
    if (hidden === this.#hidden) return;
    this.#hidden = hidden;
    const token = ++this.#token;
    if (hidden) {
      this.#clearTimers();
      this.stopAllSfx();
      if (this.#playing) this.#b.pause(this.#playing);
      this.#playing = null;
      this.#b.ambience(false, 0);
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

  playSfx(id: SfxId): boolean {
    if (!this.#unlocked || this.#hidden || !SCENES[this.#scene].sfx || this.#levels.muted || this.#levels.sfx <= 0) return false;
    const same = this.#active.filter((a) => a.id === id);
    if (same.length >= SFX_LIMIT[id] || this.#active.length >= MAX_SFX) {
      this.stats.sfxDropped++;
      return false;
    }
    const h = this.#b.playSfx(id);
    if (!h) return false;
    const entry = { id, h };
    this.#active.push(entry);
    h.onEnded(() => (this.#active = this.#active.filter((a) => a !== entry)));
    this.stats.sfxPlayed++;
    return true;
  }

  stopAllSfx(): void {
    const all = this.#active;
    this.#active = [];
    for (const a of all) a.h.stop();
  }

  /** Reset (restart/leave): cancel pending fades/restarts and cut SFX. Music follows the next scene. */
  reset(): void {
    this.#token++;
    this.#clearTimers();
    this.stopAllSfx();
  }

  // ---- internals ----------------------------------------------------------------

  #applyLevels(ramp: number): void {
    const L = this.#levels;
    this.#b.setGain('master', L.muted ? 0 : L.master, ramp);
    this.#b.setGain('music', L.music, ramp);
    this.#b.setGain('sfx', L.sfx, ramp);
    this.#b.setGain('voice', L.voice, ramp);
    this.#b.setGain('ambience', L.ambience, ramp);
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

  /** Bring audio in line with the current scene. */
  #apply(token: number): void {
    this.#clearTimers();
    const spec = SCENES[this.#scene];
    this.#b.ambience(spec.ambience && this.#levels.ambienceOn, 0.8);
    const want = spec.track && this.#b.hasTrack(spec.track) && !this.#broken.has(spec.track) ? spec.track : null;
    const cur = this.#playing;
    if (cur && cur === want) {
      this.#b.fade(cur, spec.duck, 0.5);
      return;
    }
    if (cur) {
      // Fade out and stop the old track BEFORE starting anything new: never two music sources.
      this.#b.fade(cur, 0, FADE_OUT_SEC);
      this.#playing = null;
      const old = cur;
      const h = this.#sched.set(() => {
        this.#timers.delete(h);
        // Always stop the faded track, even if the scene moved on.
        if (this.#playing !== old) this.#b.pause(old);
        if (token !== this.#token) return void this.stats.staleDropped++;
        if (want) this.#start(want, token, true);
      }, FADE_OUT_SEC * 1000);
      this.#timers.add(h);
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
      this.#b.fade(id, SCENES[this.#scene].duck, FADE_IN_SEC);
    });
  }

  #onEnded(id: TrackId): void {
    if (this.#playing !== id) return;
    // Composed ending reached: breathe, then start the song again (no assumed loop points).
    const token = this.#token;
    this.#playing = null;
    this.#later(token, this.#gap[id], () => {
      const spec = SCENES[this.#scene];
      if (spec.track === id && !this.#hidden && !this.#playing) this.#start(id, token, true);
    });
  }

  #onError(id: TrackId): void {
    this.#broken.add(id);
    if (this.#playing === id) this.#playing = null;
  }
}
