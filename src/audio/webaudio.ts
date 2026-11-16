/**
 * Browser backend for AudioManager: Web Audio buses (master → music / sfx /
 * voice / ambience) with music streamed from <audio> elements through
 * per-track gain nodes (no full-file decode). The AudioContext is created only
 * inside the user-gesture unlock, so no autoplay warnings fire at startup.
 * Every play() promise is caught; missing files report through onError.
 */
import type { AudioBackend, Bus, SfxHandle, SfxId, TrackId } from './manager';
import { ambienceBuffer, synthSfx } from './synth';

interface Track {
  el: HTMLAudioElement;
  gain: GainNode | null;
  dbGain: number;
  ended: (() => void) | null;
  error: (() => void) | null;
}

export class WebAudioBackend implements AudioBackend {
  #ctx: AudioContext | null = null;
  #bus = new Map<'master' | Bus, GainNode>();
  #pendingGain = new Map<'master' | Bus, number>();
  #tracks = new Map<TrackId, Track>();
  #urls: Partial<Record<TrackId, string>>;
  #ambience: { src: AudioBufferSourceNode; gain: GainNode } | null = null;

  constructor(urls: Partial<Record<TrackId, string>>, gainDb: Partial<Record<TrackId, number>>) {
    this.#urls = urls;
    for (const [id, url] of Object.entries(urls) as [TrackId, string][]) {
      const el = new Audio();
      el.preload = 'none';
      el.src = url;
      const t: Track = { el, gain: null, dbGain: gainDb[id] ?? 0, ended: null, error: null };
      el.addEventListener('ended', () => t.ended?.());
      el.addEventListener('error', () => t.error?.());
      this.#tracks.set(id, t);
    }
  }

  async unlock(): Promise<boolean> {
    try {
      if (!this.#ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return true; // no Web Audio: elements still play, gains fall back to element volume
        const ctx = new Ctor();
        this.#ctx = ctx;
        const master = ctx.createGain();
        master.connect(ctx.destination);
        this.#bus.set('master', master);
        for (const b of ['music', 'sfx', 'voice', 'ambience'] as Bus[]) {
          const g = ctx.createGain();
          g.connect(master);
          this.#bus.set(b, g);
        }
        for (const [k, v] of this.#pendingGain) this.#bus.get(k)!.gain.value = v;
        for (const t of this.#tracks.values()) {
          const src = ctx.createMediaElementSource(t.el);
          t.gain = ctx.createGain();
          t.gain.gain.value = 0;
          src.connect(t.gain).connect(this.#bus.get('music')!);
        }
      }
      if (this.#ctx.state !== 'running') await this.#ctx.resume();
      return this.#ctx.state === 'running';
    } catch {
      return false;
    }
  }

  suspend(): void {
    void this.#ctx?.suspend().catch(() => {});
  }

  async resume(): Promise<boolean> {
    if (!this.#ctx) return false;
    try {
      await this.#ctx.resume();
      return this.#ctx.state === 'running';
    } catch {
      return false;
    }
  }

  setGain(target: 'master' | Bus, value: number, rampSec: number): void {
    this.#pendingGain.set(target, value);
    const g = this.#bus.get(target);
    if (!g || !this.#ctx) {
      // Fallback without Web Audio: master × music on the elements.
      if (!this.#ctx) {
        const m = this.#pendingGain.get('master') ?? 1;
        const mu = this.#pendingGain.get('music') ?? 1;
        for (const t of this.#tracks.values()) t.el.volume = Math.max(0, Math.min(1, m * mu));
      }
      return;
    }
    const now = this.#ctx.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(g.gain.value, now);
    g.gain.linearRampToValueAtTime(value, now + Math.max(0.001, rampSec));
  }

  hasTrack(id: TrackId): boolean {
    return Boolean(this.#urls[id]);
  }

  load(id: TrackId, preload: 'metadata' | 'auto'): void {
    const t = this.#tracks.get(id);
    if (t && t.el.preload !== 'auto') t.el.preload = preload;
  }

  async play(id: TrackId, fromStart: boolean): Promise<boolean> {
    const t = this.#tracks.get(id);
    if (!t || t.el.error) return false;
    try {
      if (fromStart) t.el.currentTime = 0;
      t.el.preload = 'auto';
      await t.el.play();
      return true;
    } catch {
      return false; // autoplay refusal or decode failure: the scene simply stays quiet
    }
  }

  pause(id: TrackId): void {
    this.#tracks.get(id)?.el.pause();
  }

  fade(id: TrackId, to: number, sec: number): void {
    const t = this.#tracks.get(id);
    if (!t?.gain || !this.#ctx) return;
    const target = to * 10 ** (t.dbGain / 20);
    const now = this.#ctx.currentTime;
    t.gain.gain.cancelScheduledValues(now);
    t.gain.gain.setValueAtTime(t.gain.gain.value, now);
    if (sec <= 0) t.gain.gain.setValueAtTime(target, now);
    else t.gain.gain.linearRampToValueAtTime(target, now + sec);
  }

  onEnded(id: TrackId, cb: () => void): void {
    const t = this.#tracks.get(id);
    if (t) t.ended = cb;
  }

  onError(id: TrackId, cb: () => void): void {
    const t = this.#tracks.get(id);
    if (t) t.error = cb;
  }

  playSfx(id: SfxId): SfxHandle | null {
    const ctx = this.#ctx;
    const bus = this.#bus.get('sfx');
    if (!ctx || !bus || ctx.state !== 'running') return null;
    const { sources, seconds } = synthSfx(ctx, bus, id);
    let done = false;
    let cb: (() => void) | null = null;
    const finish = () => {
      if (done) return;
      done = true;
      cb?.();
    };
    const timer = window.setTimeout(finish, seconds * 1000 + 60);
    return {
      stop: () => {
        clearTimeout(timer);
        for (const s of sources) {
          try {
            s.stop();
          } catch {
            /* already stopped */
          }
        }
        finish();
      },
      onEnded: (c) => void (cb = c),
    };
  }

  ambience(on: boolean, fadeSec: number): void {
    const ctx = this.#ctx;
    const bus = this.#bus.get('ambience');
    if (!ctx || !bus) return;
    const now = ctx.currentTime;
    if (on && !this.#ambience) {
      const src = ctx.createBufferSource();
      src.buffer = ambienceBuffer(ctx);
      src.loop = true;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.06, now + Math.max(0.01, fadeSec)); // very quiet bed
      src.connect(gain).connect(bus);
      src.start();
      this.#ambience = { src, gain };
    } else if (!on && this.#ambience) {
      const a = this.#ambience;
      this.#ambience = null;
      a.gain.gain.cancelScheduledValues(now);
      a.gain.gain.setValueAtTime(a.gain.gain.value, now);
      a.gain.gain.linearRampToValueAtTime(0, now + Math.max(0.01, fadeSec));
      a.src.stop(now + Math.max(0.01, fadeSec) + 0.05);
    }
  }

  /** Debug: how many music elements are currently playing (must be ≤ 1). */
  playingCount(): number {
    return [...this.#tracks.values()].filter((t) => !t.el.paused).length;
  }
}
