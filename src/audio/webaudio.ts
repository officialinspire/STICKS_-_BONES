/**
 * Browser backend for AudioManager: Web Audio buses (master → music / sfx /
 * voice / ambience) with music streamed from <audio> elements through
 * per-track gain nodes (no full-file decode). Short SFX and the ambience beds
 * are fetched once and DECODED into buffers (bounded: one buffer per file).
 * The AudioContext is created only inside the user-gesture unlock, so no
 * autoplay warnings fire at startup. Every play() promise and decode is caught;
 * missing files report through onError or fall back (synth placeholder for SFX,
 * silence for beds).
 */
import type { AudioBackend, Bus, MediaFailure, SfxHandle, TrackId, Voice } from './manager';
import { loopBounds } from './loop';
import { bedUrl, sampleUrl, type BedId } from './sounds';
import { synthSfx } from './synth';

/**
 * missing   = absent (no URL, or HTTP 404/410): never fetched again.
 * broken    = the file arrived but won't decode: never fetched again.
 * transient = offline, network error or a temporary HTTP status: retried (bounded) by retryTransient().
 */
type Decoded = AudioBuffer | 'loading' | 'missing' | 'broken' | 'transient';
/** How many times one sample/bed file may be re-fetched after transient failures. */
export const MAX_FETCH_ATTEMPTS = 3;
const ABSENT = new Set([404, 410]);
interface BedVoice {
  id: BedId;
  src: AudioBufferSourceNode;
  gain: GainNode;
}

interface Track {
  el: HTMLAudioElement;
  gain: GainNode | null;
  dbGain: number;
  ended: (() => void) | null;
  error: ((kind: MediaFailure) => void) | null;
  url: string;
}

export class WebAudioBackend implements AudioBackend {
  #ctx: AudioContext | null = null;
  #bus = new Map<'master' | Bus, GainNode>();
  #pendingGain = new Map<'master' | Bus, number>();
  #tracks = new Map<TrackId, Track>();
  #urls: Partial<Record<TrackId, string>>;
  #buffers = new Map<string, Decoded>();
  #waiters = new Map<string, (() => void)[]>();
  /** The bed currently sounding (or fading in) and the ones fading out (bounded to one). */
  #bed: BedVoice | null = null;
  #bedOut: BedVoice | null = null;
  #wantBed: { id: BedId | null; level: number; gen: number; fade: number } = { id: null, level: 0, gen: 0, fade: 0.01 };
  /** Fetch attempts per sample/bed key (bounded by MAX_FETCH_ATTEMPTS). */
  #attempts = new Map<string, number>();
  readonly stats = { decoded: 0, decodeFailed: 0, missing: 0, transient: 0, retried: 0, synthFallback: 0, bedStarts: 0, bedLoops: [] as { id: string; start: number; end: number; length: number }[] };

  constructor(urls: Partial<Record<TrackId, string>>, gainDb: Partial<Record<TrackId, number>>) {
    this.#urls = urls;
    for (const [id, url] of Object.entries(urls) as [TrackId, string][]) {
      const el = new Audio();
      el.preload = 'none';
      el.src = url;
      const t: Track = { el, gain: null, dbGain: gainDb[id] ?? 0, ended: null, error: null, url };
      el.addEventListener('ended', () => t.ended?.());
      el.addEventListener('error', () => void this.#classify(t).then((kind) => t.error?.(kind)));
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

  onError(id: TrackId, cb: (kind: MediaFailure) => void): void {
    const t = this.#tracks.get(id);
    if (t) t.error = cb;
  }

  /**
   * What a music element's error means. Network errors (and anything while offline) are transient; a decode
   * error is a broken file; "source not supported" is checked with a HEAD request, since a 404 looks the same
   * to the element as an unsupported format.
   */
  async #classify(t: Track): Promise<MediaFailure> {
    const code = t.el.error?.code ?? 0;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'transient';
    if (code === 2 /* MEDIA_ERR_NETWORK */ || code === 1 /* MEDIA_ERR_ABORTED */) return 'transient';
    if (code === 3 /* MEDIA_ERR_DECODE */) return 'broken';
    try {
      const r = await fetch(t.url, { method: 'HEAD', cache: 'no-store' });
      if (ABSENT.has(r.status)) return 'absent';
      return r.ok ? 'broken' : 'transient';
    } catch {
      return 'transient';
    }
  }

  /** Clear a recoverable media error: re-point the element at its file so the next play() loads it afresh. */
  resetTrack(id: TrackId): void {
    const t = this.#tracks.get(id);
    if (!t) return;
    try {
      t.el.pause();
      t.el.removeAttribute('src');
      t.el.src = t.url;
      t.el.load();
    } catch {
      /* the element refused: it stays failed until the next attempt */
    }
  }

  /**
   * Re-fetch samples and beds that failed for a temporary reason (bounded per file). Only the CURRENT bed is
   * started again once it decodes; no sound effect or cue is replayed.
   */
  retryTransient(): boolean {
    let any = false;
    for (const [key, v] of [...this.#buffers]) {
      if (v !== 'transient' || (this.#attempts.get(key) ?? 0) >= MAX_FETCH_ATTEMPTS) continue;
      this.#buffers.delete(key);
      this.stats.retried++;
      any = true;
      const bed = key.startsWith('bed:') ? (key.slice(4) as BedId) : null;
      if (bed && this.#wantBed.id === bed && !this.#bed) {
        const gen = this.#wantBed.gen;
        this.#waiters.set(key, [() => this.#startBed(bed, gen)]);
      }
      this.#decode(key, bed ? bedUrl(bed) : sampleUrl(key));
    }
    return any;
  }

  /** Fetch + decode one file into the bounded buffer cache. Resolves when it is usable (or known unusable). */
  #decode(key: string, url: string | null): void {
    const ctx = this.#ctx;
    if (!ctx || this.#buffers.has(key)) return;
    if (!url) {
      this.#buffers.set(key, 'missing');
      this.stats.missing++;
      return;
    }
    this.#buffers.set(key, 'loading');
    this.#attempts.set(key, (this.#attempts.get(key) ?? 0) + 1);
    const done = (v: Decoded) => {
      this.#buffers.set(key, v);
      for (const w of this.#waiters.get(key) ?? []) w();
      this.#waiters.delete(key);
    };
    let stage: 'fetch' | 'decode' = 'fetch';
    fetch(url)
      .then((r) => {
        if (r.ok) return r.arrayBuffer();
        // Absent files are remembered as missing; other statuses (5xx, 408, 429…) may pass.
        return Promise.reject(Object.assign(new Error(`HTTP ${r.status}`), { absent: ABSENT.has(r.status) }));
      })
      .then((ab) => {
        stage = 'decode';
        return ctx.decodeAudioData(ab);
      })
      .then((buf) => {
        this.stats.decoded++;
        done(buf);
      })
      .catch((e: { absent?: boolean }) => {
        if (e?.absent) {
          this.stats.missing++;
          return done('missing');
        }
        if (stage === 'decode') {
          this.stats.decodeFailed++;
          return done('broken'); // the file itself is bad: never re-fetched
        }
        // Offline / network error / temporary status: the placeholder (SFX) or silence (bed) for now, and
        // retryTransient() may fetch it again after a gesture or reconnection (bounded).
        this.stats.transient++;
        done('transient');
      });
  }

  preloadSamples(ids: readonly string[]): void {
    for (const id of ids) this.#decode(id, sampleUrl(id));
  }

  playSfx(v: Voice): SfxHandle | null {
    const ctx = this.#ctx;
    const bus = this.#bus.get(v.bus ?? 'sfx');
    if (!ctx || !bus || ctx.state !== 'running') return null;
    if (v.placeholder === false && v.sample && !(this.#buffers.get(v.sample) instanceof AudioBuffer)) {
      // Music cues are never synthesized: not decoded yet (fetch it for next time), missing or failed → nothing.
      if (!this.#buffers.has(v.sample)) this.#decode(v.sample, sampleUrl(v.sample));
      return null;
    }
    const startAt = ctx.currentTime + 0.005 + Math.max(0, v.delay);
    const gain = ctx.createGain();
    gain.gain.value = v.gain;
    gain.connect(bus);
    let sources: AudioScheduledSourceNode[];
    let seconds: number;
    const buf = v.sample ? this.#buffers.get(v.sample) : undefined;
    if (buf instanceof AudioBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = v.rate;
      // Explicit, auditioned loop points only (src/audio/case-complete.ts): it then sounds until stopped.
      const loop = v.loop && v.loop.end <= buf.duration ? v.loop : null;
      if (loop) {
        src.loop = true;
        src.loopStart = loop.start;
        src.loopEnd = loop.end;
      }
      src.connect(gain);
      src.start(startAt);
      sources = [src];
      seconds = loop ? Infinity : buf.duration / v.rate;
    } else {
      // Not decoded (yet), missing or broken: the synthesized placeholder, one voice per sound.
      if (v.sample && !this.#buffers.has(v.sample)) this.#decode(v.sample, sampleUrl(v.sample));
      this.stats.synthFallback++;
      ({ sources, seconds } = synthSfx(ctx, gain, v.synth, startAt));
    }
    let done = false;
    let cb: (() => void) | null = null;
    const finish = () => {
      if (done) return;
      done = true;
      cb?.();
      // Disconnect after any release ramp has finished.
      window.setTimeout(() => gain.disconnect(), 120);
    };
    const timer = Number.isFinite(seconds) ? window.setTimeout(finish, (startAt - ctx.currentTime + seconds) * 1000 + 60) : 0;
    return {
      stop: () => {
        if (done) return;
        clearTimeout(timer);
        const now = ctx.currentTime;
        // Not started yet: cancel outright. Sounding: a 30 ms release, no click.
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.03);
        for (const s of sources) {
          try {
            s.stop(now < startAt ? 0 : now + 0.035);
          } catch {
            /* already stopped */
          }
        }
        finish();
      },
      onEnded: (c) => void (cb = c),
    };
  }

  ambience(bed: BedId | null, level: number, fadeSec: number): void {
    const gen = this.#wantBed.gen + 1;
    this.#wantBed = { id: bed, level, gen, fade: Math.max(0.01, fadeSec) };
    const ctx = this.#ctx;
    const bus = this.#bus.get('ambience');
    if (!ctx || !bus) return;
    const fade = Math.max(0.01, fadeSec);
    const now = ctx.currentTime;
    const ramp = (g: GainNode, to: number, sec: number) => {
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(to, now + sec);
    };
    if (this.#bed && this.#bed.id === bed) {
      ramp(this.#bed.gain, level, fade); // same bed: only its level moves
      return;
    }
    // Retire the current bed (gentle fade); a bed still fading from before is cut at once (≤ 2 beds ever).
    if (this.#bedOut) this.#stopBed(this.#bedOut, 0);
    this.#bedOut = null;
    if (this.#bed) {
      const old = this.#bed;
      this.#bed = null;
      ramp(old.gain, 0, fade);
      this.#stopBed(old, fade + 0.05);
      this.#bedOut = old;
    }
    if (!bed) return;
    const key = `bed:${bed}`;
    const start = () => this.#startBed(bed, gen);
    const cur = this.#buffers.get(key);
    if (cur instanceof AudioBuffer) start();
    else if (cur === 'loading') this.#waiters.set(key, [...(this.#waiters.get(key) ?? []), start]);
    else if (cur === undefined) {
      this.#waiters.set(key, [start]);
      this.#decode(key, bedUrl(bed));
      if (this.#buffers.get(key) === 'missing') this.#waiters.delete(key);
    }
  }

  /** Start the wanted bed once its buffer is ready; a superseded request (older gen) never starts late. */
  #startBed(bed: BedId, gen: number): void {
    const bus = this.#bus.get('ambience');
    if (this.#wantBed.gen !== gen || this.#wantBed.id !== bed || !this.#ctx || !bus || this.#bed) return;
    const buf = this.#buffers.get(`bed:${bed}`);
    if (!(buf instanceof AudioBuffer)) return; // missing, broken or transient: silence, not a placeholder
    const c = this.#ctx;
    const t = c.currentTime;
    const fade = this.#wantBed.fade;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const chans = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i));
    const lb = loopBounds(chans, Math.floor(buf.sampleRate * 0.2));
    src.loopStart = lb.start / buf.sampleRate;
    src.loopEnd = lb.end / buf.sampleRate;
    if (!this.stats.bedLoops.some((l) => l.id === bed)) this.stats.bedLoops.push({ id: bed, start: lb.start, end: lb.end, length: buf.length });
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(this.#wantBed.level, t + fade);
    src.connect(g).connect(bus);
    src.start(t, src.loopStart);
    this.#bed = { id: bed, src, gain: g };
    this.stats.bedStarts++;
  }

  #stopBed(b: BedVoice, afterSec: number): void {
    try {
      b.src.stop(this.#ctx ? this.#ctx.currentTime + afterSec : 0);
    } catch {
      /* already stopped */
    }
  }

  /** Debug/tests: the audio clock (null before the first gesture). */
  get context(): AudioContext | null {
    return this.#ctx;
  }

  /** Debug: the bed sounding now (and whether one is fading out). */
  bedState(): { bed: BedId | null; fadingOut: BedId | null; wanted: BedId | null } {
    return { bed: this.#bed?.id ?? null, fadingOut: this.#bedOut?.id ?? null, wanted: this.#wantBed.id };
  }

  /** Debug: decoded-buffer cache states. */
  bufferStates(): Record<string, string> {
    return Object.fromEntries([...this.#buffers].map(([k, v]) => [k, v instanceof AudioBuffer ? 'decoded' : v]));
  }

  /** Debug: how many music elements are currently playing (must be ≤ 1). */
  playingCount(): number {
    return [...this.#tracks.values()].filter((t) => !t.el.paused).length;
  }
}
