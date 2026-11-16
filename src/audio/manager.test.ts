import { describe, expect, it } from 'vitest';
import { DEFAULT_AUDIO, type AudioSettings } from '../app/settings';
import type { Scheduler } from '../app/session';
import { AudioManager, MAX_SFX, SFX_LIMIT, type AudioBackend, type SfxHandle, type SfxId, type TrackId } from './manager';

/** Fake backend: records calls; play() resolution is controlled by the test. */
function fakeBackend(opts: { missing?: TrackId[]; reject?: boolean; unlock?: boolean } = {}) {
  const log: string[] = [];
  const pendingPlays: { id: TrackId; resolve: (ok: boolean) => void }[] = [];
  const ended: Partial<Record<TrackId, () => void>> = {};
  const errored: Partial<Record<TrackId, () => void>> = {};
  const audible = new Set<TrackId>();
  const gains: Record<string, number> = {};
  const sfx: { id: SfxId; end: () => void; stopped: boolean }[] = [];
  let ambience = false;
  const b: AudioBackend = {
    unlock: async () => opts.unlock ?? true,
    suspend: () => log.push('suspend'),
    resume: async () => true,
    setGain: (t, v) => void (gains[t] = v),
    hasTrack: (id) => !(opts.missing ?? []).includes(id),
    load: (id, p) => log.push(`load:${id}:${p}`),
    play: (id) =>
      new Promise<boolean>((resolve) => {
        log.push(`play:${id}`);
        pendingPlays.push({
          id,
          resolve: (ok) => {
            if (ok && !opts.reject) audible.add(id);
            resolve(ok && !opts.reject);
          },
        });
      }),
    pause: (id) => {
      log.push(`pause:${id}`);
      audible.delete(id);
    },
    fade: (id, to) => log.push(`fade:${id}:${to}`),
    onEnded: (id, cb) => void (ended[id] = cb),
    onError: (id, cb) => void (errored[id] = cb),
    playSfx: (id) => {
      let cb: (() => void) | null = null;
      const e = {
        id,
        stopped: false,
        end: () => {
          cb?.();
          cb = null;
        },
      };
      sfx.push(e);
      const h: SfxHandle = {
        stop: () => {
          e.stopped = true;
          e.end();
        },
        onEnded: (c) => void (cb = c),
      };
      return h;
    },
    ambience: (on) => void (ambience = on),
  };
  return { b, log, pendingPlays, ended, errored, audible, gains, sfx, ambienceOn: () => ambience, resolveAll: (ok = true) => pendingPlays.splice(0).forEach((p) => p.resolve(ok)) };
}

function manualScheduler() {
  const q: { fn: () => void; id: number }[] = [];
  let id = 0;
  const s: Scheduler = {
    set: (fn) => {
      q.push({ fn, id: ++id });
      return id;
    },
    clear: (h) => {
      const i = q.findIndex((x) => x.id === h);
      if (i >= 0) q.splice(i, 1);
    },
  };
  return { s, flushAll: () => q.splice(0).forEach((x) => x.fn()), size: () => q.length };
}
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function make(levels: Partial<AudioSettings> = {}, backendOpts: Parameters<typeof fakeBackend>[0] = {}) {
  const fb = fakeBackend(backendOpts);
  const sc = manualScheduler();
  const m = new AudioManager({ backend: fb.b, scheduler: sc.s, levels: { ...DEFAULT_AUDIO, ...levels }, gapSec: { menu: 0.8, gameplay: 0.6 } });
  return { m, fb, sc };
}

describe('AudioManager', () => {
  it('nothing plays before the user-gesture unlock; the desired scene starts on unlock', async () => {
    const { m, fb } = make();
    m.setScene('menu');
    expect(fb.log.filter((l) => l.startsWith('play'))).toEqual([]);
    expect(m.playSfx('tap')).toBe(false);
    await m.unlock();
    expect(fb.log).toContain('play:menu');
    fb.resolveAll();
    await tick();
    expect(m.playing).toBe('menu');
    expect(fb.audible.size).toBe(1);
  });

  it('switching scenes never overlaps two music sources (fade out + pause before the next starts)', async () => {
    const { m, fb, sc } = make();
    await m.unlock();
    m.setScene('menu');
    fb.resolveAll();
    await tick();
    m.setScene('gameplay');
    expect(fb.log.filter((l) => l === 'play:gameplay')).toHaveLength(0); // waits for the fade-out
    sc.flushAll(); // fade-out timer: pause menu, then start gameplay
    expect(fb.audible.has('menu')).toBe(false);
    fb.resolveAll();
    await tick();
    expect([...fb.audible]).toEqual(['gameplay']);
  });

  it('rapid scene changes leave exactly the last scene’s track, and stale play() results are dropped', async () => {
    const { m, fb, sc } = make();
    await m.unlock();
    m.setScene('menu');
    m.setScene('gameplay');
    m.setScene('menu');
    m.setScene('intro');
    m.setScene('menu');
    sc.flushAll();
    fb.resolveAll();
    await tick();
    sc.flushAll();
    fb.resolveAll();
    await tick();
    expect(fb.audible.size).toBeLessThanOrEqual(1);
    expect(m.playing === null || fb.audible.has(m.playing)).toBe(true);
    if (m.playing) expect(m.playing).toBe('menu');
  });

  it('paused and results duck the gameplay track instead of starting another', async () => {
    const { m, fb } = make();
    await m.unlock();
    m.setScene('gameplay');
    fb.resolveAll();
    await tick();
    const plays = fb.log.filter((l) => l.startsWith('play')).length;
    m.setScene('paused');
    m.setScene('results');
    expect(fb.log.filter((l) => l.startsWith('play')).length).toBe(plays);
    expect(fb.log).toContain('fade:gameplay:0.35');
    expect(fb.log).toContain('fade:gameplay:0.7');
  });

  it('the intro scene silences music and refuses SFX (no start-button sound leaks into the credit)', async () => {
    const { m, fb, sc } = make();
    await m.unlock();
    m.setScene('menu');
    fb.resolveAll();
    await tick();
    m.setScene('intro');
    sc.flushAll();
    expect(fb.audible.size).toBe(0);
    expect(m.playSfx('tap')).toBe(false);
  });

  it('a track that ends restarts after its gap (composed ending, no assumed loop point)', async () => {
    const { m, fb, sc } = make();
    await m.unlock();
    m.setScene('menu');
    fb.resolveAll();
    await tick();
    fb.ended.menu!();
    expect(m.playing).toBeNull();
    sc.flushAll();
    expect(fb.log.filter((l) => l === 'play:menu')).toHaveLength(2);
    // If the scene changed during the gap, the restart is dropped.
    fb.resolveAll();
    await tick();
    fb.ended.menu!();
    m.setScene('intro');
    sc.flushAll();
    expect(fb.log.filter((l) => l === 'play:menu')).toHaveLength(2);
  });

  it('play() rejection and missing or broken files leave the scene silent without throwing', async () => {
    const r = make({}, { reject: true });
    await r.m.unlock();
    r.m.setScene('menu');
    r.fb.resolveAll();
    await tick();
    expect(r.m.playing).toBeNull();
    expect(r.m.stats.playRejected).toBe(1);
    const miss = make({}, { missing: ['gameplay'] });
    await miss.m.unlock();
    miss.m.setScene('gameplay');
    expect(miss.fb.log.some((l) => l.startsWith('play'))).toBe(false);
    const err = make();
    await err.m.unlock();
    err.m.setScene('menu');
    err.fb.errored.menu!();
    err.m.setScene('gameplay');
    err.sc.flushAll();
    err.m.setScene('menu');
    err.sc.flushAll();
    expect(err.fb.log.filter((l) => l === 'play:menu')).toHaveLength(1); // no retry storm on a broken file
  });

  it('mute is honoured everywhere and survives scene changes and resume', async () => {
    const { m, fb } = make({ muted: true });
    await m.unlock();
    expect(fb.gains.master).toBe(0);
    m.setScene('menu');
    expect(m.playSfx('tap')).toBe(false);
    m.setHidden(true);
    m.setHidden(false);
    await tick();
    expect(fb.gains.master).toBe(0);
    m.setLevels({ ...m.levels, muted: false });
    expect(fb.gains.master).toBe(DEFAULT_AUDIO.master);
  });

  it('background pauses music and cuts SFX; foreground resumes only the current scene', async () => {
    const { m, fb, sc } = make();
    await m.unlock();
    m.setScene('gameplay');
    fb.resolveAll();
    await tick();
    m.playSfx('place');
    m.setHidden(true);
    expect(fb.audible.size).toBe(0);
    expect(m.activeSfx()).toBe(0);
    expect(fb.log).toContain('suspend');
    m.setScene('menu'); // scene changed while hidden
    m.setHidden(false);
    await tick();
    sc.flushAll();
    fb.resolveAll();
    await tick();
    expect([...fb.audible]).toEqual(['menu']);
  });

  it('SFX respect per-sound instance limits and the global cap; reset cuts them', async () => {
    const { m, fb } = make();
    await m.unlock();
    m.setScene('gameplay');
    for (let i = 0; i < 5; i++) m.playSfx('place');
    expect(m.activeSfx()).toBe(SFX_LIMIT.place);
    for (const id of ['knock', 'knock', 'knock', 'draw', 'draw', 'slam', 'slam'] as SfxId[]) m.playSfx(id);
    expect(m.activeSfx()).toBeLessThanOrEqual(MAX_SFX);
    expect(m.stats.sfxDropped).toBeGreaterThan(0);
    fb.sfx[0]!.end(); // a finished sound frees its slot
    expect(m.playSfx('place')).toBe(true);
    m.reset();
    expect(m.activeSfx()).toBe(0);
    expect(fb.sfx.filter((s) => s.stopped).length).toBeGreaterThan(0);
  });

  it('ambience follows the setting and the scene', async () => {
    const { m, fb } = make({ ambienceOn: true });
    await m.unlock();
    m.setScene('menu');
    expect(fb.ambienceOn()).toBe(false);
    m.setScene('gameplay');
    expect(fb.ambienceOn()).toBe(true);
    m.setLevels({ ...m.levels, ambienceOn: false });
    expect(fb.ambienceOn()).toBe(false);
  });
});
