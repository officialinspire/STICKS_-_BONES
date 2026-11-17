/**
 * Studio intro sequencing. ONE guarded transition — finish(reason) — handles
 * Skip, natural end, media error, start/stall/overall timeouts, play()
 * rejection and a missing video. Whichever happens first wins; every later
 * signal (a late 'ended', an error after Skip, a timer firing after the
 * end) is ignored, so the menu is entered exactly once and no stale callback
 * can act after the intro is gone.
 */
import type { Scheduler } from './session';

export type IntroEnd = 'skip' | 'ended' | 'error' | 'timeout' | 'rejected' | 'missing' | 'cancelled';

/** The few things the intro needs from a <video> element (faked in tests). */
export interface VideoPort {
  play(): Promise<void>;
  /** Pause without releasing (the app went to the background). */
  pause(): void;
  /** Stop and release the media so its audio can never overlap the menu. */
  release(): void;
  on(event: 'ended' | 'error' | 'playing' | 'waiting' | 'stalled' | 'loadedmetadata', cb: () => void): () => void;
  durationSec(): number | null;
}

export interface IntroOptions {
  video: VideoPort | null;
  scheduler: Scheduler;
  onFinish(reason: IntroEnd): void;
  /** Max wait for playback to actually start. */
  startTimeoutMs?: number;
  /** Max time stuck buffering mid-play. */
  stallTimeoutMs?: number;
  /** Absolute cap (also duration + margin once known). */
  maxMs?: number;
}

export class IntroController {
  #o: Required<Omit<IntroOptions, 'video'>> & { video: VideoPort | null };
  #done = false;
  #started = false;
  #suspended = false;
  #timers = new Map<string, unknown>();
  #offs: (() => void)[] = [];
  /** Why the intro finished (for tests / diagnostics). */
  reason: IntroEnd | null = null;

  constructor(o: IntroOptions) {
    this.#o = { startTimeoutMs: 6000, stallTimeoutMs: 5000, maxMs: 45000, ...o };
  }

  get done(): boolean {
    return this.#done;
  }

  start(): void {
    if (this.#started || this.#done) return;
    this.#started = true;
    const v = this.#o.video;
    if (!v) {
      // Keep the transition asynchronous and on the same guarded path.
      this.#timer('missing', 0, () => this.finish('missing'));
      return;
    }
    this.#offs.push(
      v.on('ended', () => this.finish('ended')),
      v.on('error', () => this.finish('error')),
      v.on('playing', () => {
        this.#clear('start');
        this.#clear('stall');
      }),
      v.on('waiting', () => this.#suspended || this.#timer('stall', this.#o.stallTimeoutMs, () => this.finish('timeout'))),
      v.on('stalled', () => this.#suspended || this.#timer('stall', this.#o.stallTimeoutMs, () => this.finish('timeout'))),
      v.on('loadedmetadata', () => {
        const d = v.durationSec();
        if (d && Number.isFinite(d)) this.#timer('max', Math.min(this.#o.maxMs, d * 1000 + 3000), () => this.finish('timeout'));
      }),
    );
    this.#timer('start', this.#o.startTimeoutMs, () => this.finish('timeout'));
    this.#timer('max', this.#o.maxMs, () => this.finish('timeout'));
    v.play().catch(() => this.finish('rejected'));
  }

  skip(): void {
    this.finish('skip');
  }

  /**
   * The app went to the background mid-credit: pause the video and stop every timer, so the
   * credit can't time out (and the menu can't open) while nobody is looking.
   */
  suspend(): void {
    if (!this.#started || this.#done || this.#suspended || !this.#o.video) return; // no video: the 'missing' path stays armed
    this.#suspended = true;
    for (const t of this.#timers.values()) this.#o.scheduler.clear(t);
    this.#timers.clear();
    this.#o.video?.pause();
  }

  /** Back in the foreground: play on with fresh start/overall timers; a refusal ends the credit. */
  resume(): void {
    if (!this.#suspended || this.#done) return;
    this.#suspended = false;
    const v = this.#o.video;
    if (!v) return;
    this.#timer('start', this.#o.startTimeoutMs, () => this.finish('timeout'));
    this.#timer('max', this.#o.maxMs, () => this.finish('timeout'));
    v.play().catch(() => this.finish('rejected'));
  }

  /** The single guarded transition. Idempotent. */
  finish(reason: IntroEnd): void {
    if (this.#done) return;
    this.#done = true;
    this.reason = reason;
    for (const t of this.#timers.values()) this.#o.scheduler.clear(t);
    this.#timers.clear();
    for (const off of this.#offs) off();
    this.#offs = [];
    this.#o.video?.release();
    this.#o.onFinish(reason);
  }

  #timer(key: string, ms: number, fn: () => void): void {
    this.#clear(key);
    this.#timers.set(
      key,
      this.#o.scheduler.set(() => {
        this.#timers.delete(key);
        if (!this.#done) fn();
      }, ms),
    );
  }

  #clear(key: string): void {
    const t = this.#timers.get(key);
    if (t !== undefined) this.#o.scheduler.clear(t);
    this.#timers.delete(key);
  }
}
