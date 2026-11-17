import { describe, expect, it } from 'vitest';
import { DEFAULT_AUDIO, type AudioSettings } from '../app/settings';
import type { Scheduler } from '../app/session';
import { AudioManager, MAX_SFX, SFX_LIMIT, STATE_CUES, type AudioBackend, type SfxHandle, type SfxId, type TrackId, type Voice } from './manager';
import { MOTIF, VARIANTS, type BedId } from './sounds';

/** Fake backend: records calls; play() resolution is controlled by the test. */
function fakeBackend(opts: { missing?: TrackId[]; reject?: boolean; unlock?: boolean } = {}) {
  const log: string[] = [];
  const pendingPlays: { id: TrackId; resolve: (ok: boolean) => void }[] = [];
  const ended: Partial<Record<TrackId, () => void>> = {};
  const errored: Partial<Record<TrackId, () => void>> = {};
  const audible = new Set<TrackId>();
  const gains: Record<string, number> = {};
  const sfx: { id: Voice; end: () => void; stopped: boolean }[] = [];
  let ambience: { bed: BedId | null; level: number } = { bed: null, level: 0 };
  const beds: (BedId | null)[] = [];
  const preloaded: string[] = [];
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
    preloadSamples: (ids) => void preloaded.push(...ids),
    ambience: (bed, level) => {
      ambience = { bed, level };
      beds.push(bed);
    },
  };
  return { b, log, pendingPlays, ended, errored, audible, gains, sfx, beds, preloaded, ambienceOn: () => ambience.bed !== null, ambience: () => ambience, resolveAll: (ok = true) => pendingPlays.splice(0).forEach((p) => p.resolve(ok)) };
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

  it('scene changes DURING a fade-out never start a second track (checked after every step)', async () => {
    const { m, fb, sc } = make();
    await m.unlock();
    m.setScene('menu');
    fb.resolveAll();
    await tick();
    // Fast taps: gameplay (menu starts fading), then menu, then gameplay again — all inside the fade.
    const seq: Parameters<typeof m.setScene>[0][] = ['gameplay', 'menu', 'gameplay', 'paused', 'menu', 'gameplay'];
    for (const scene of seq) {
      m.setScene(scene);
      fb.resolveAll();
      await tick();
      expect(fb.audible.size).toBeLessThanOrEqual(1);
    }
    // Let the pending fade finish: the old track is paused, then the current scene's track starts.
    sc.flushAll();
    expect(fb.audible.size).toBeLessThanOrEqual(1);
    fb.resolveAll();
    await tick();
    sc.flushAll();
    fb.resolveAll();
    await tick();
    expect([...fb.audible]).toEqual(['gameplay']);
    expect(m.playing).toBe('gameplay');
  });

  it('hiding the tab mid-fade stops the fading track at once', async () => {
    const { m, fb } = make();
    await m.unlock();
    m.setScene('menu');
    fb.resolveAll();
    await tick();
    m.setScene('gameplay'); // menu now fading out
    m.setHidden(true);
    expect(fb.audible.size).toBe(0);
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
    expect(fb.ambience().bed).toBe('amb-patio');
    m.setLevels({ ...m.levels, ambienceOn: false });
    expect(fb.ambienceOn()).toBe(false);
  });
});

/** Sounding cue/SFX voices in the fake backend (not stopped and not finished). */
const live = (fb: ReturnType<typeof fakeBackend>) => fb.sfx.filter((s) => !s.stopped);

describe('AudioManager: samples, variations and voices', () => {
  it('plays decoded-sample voices with matched variants, never the same file twice in a row, within restrained gain/rate', async () => {
    const { m, fb } = make();
    await m.unlock();
    m.setScene('gameplay');
    // Only what a table can play is decoded (UI + tile/pass sounds), never the story accents.
    expect(fb.preloaded.some((x) => x.startsWith('tile-'))).toBe(true);
    expect(fb.preloaded.some((x) => x.startsWith('motif-'))).toBe(false);
    const picks: string[] = [];
    for (let i = 0; i < 30; i++) {
      m.playSfx('place');
      const v = fb.sfx.at(-1)!.id;
      picks.push(v.sample!);
      expect(VARIANTS.place).toContain(v.sample);
      expect(v.rate).toBeGreaterThanOrEqual(0.97);
      expect(v.rate).toBeLessThanOrEqual(1.03);
      expect(v.gain).toBeGreaterThan(0.8 * 10 ** (-1.6 / 20));
      expect(v.gain).toBeLessThan(0.8 * 10 ** (1.6 / 20));
      m.stopAllSfx();
    }
    for (let i = 1; i < picks.length; i++) expect(picks[i]).not.toBe(picks[i - 1]);
    expect(new Set(picks).size).toBe(VARIANTS.place.length);
  });

  it('every SFX id maps to at least one local sample', () => {
    for (const id of Object.keys(SFX_LIMIT) as SfxId[]) expect(VARIANTS[id].length).toBeGreaterThan(0);
  });

  it('silent play: master or SFX level at zero sends nothing to the backend', async () => {
    for (const levels of [{ sfx: 0 }, { master: 0 }, { muted: true }]) {
      const { m, fb } = make(levels);
      await m.unlock();
      m.setScene('story');
      expect(m.playSfx('select')).toBe(false);
      expect(m.cue('knock-motif')).toBe(false);
      expect(fb.sfx).toHaveLength(0);
    }
  });
});

describe('AudioManager: story profiles, cues and the knock motif', () => {
  async function story(levels: Partial<AudioSettings> = {}) {
    const r = make({ ambienceOn: true, ...levels });
    await r.m.unlock();
    r.m.setStoryProfile('chapter-6');
    r.m.setScene('story');
    return r;
  }

  it('the motif is exact: three identical-spacing knocks, then one answer from beyond after a longer gap', async () => {
    const { m, fb } = await story();
    expect(m.cue('knock-motif')).toBe(true);
    const v = fb.sfx.map((s) => s.id);
    expect(v.map((x) => x.sample)).toEqual([...MOTIF.knocks, MOTIF.beyond]);
    const d = v.map((x) => x.delay);
    expect(d[1]! - d[0]!).toBeCloseTo(MOTIF.interval, 6);
    expect(d[2]! - d[1]!).toBeCloseTo(MOTIF.interval, 6);
    expect(d[3]! - d[2]!).toBeCloseTo(MOTIF.answerGap, 6);
    expect(MOTIF.answerGap).toBeGreaterThan(MOTIF.interval * 1.5); // the answer is clearly separate
    expect(new Set(v.slice(0, 3).map((x) => `${x.gain}/${x.rate}`)).size).toBe(1); // matched, never varied
    for (const x of v) expect(x.rate).toBe(1);
    // Every time, the same.
    m.beat();
    m.cue('knock-motif');
    expect(fb.sfx.slice(4).map((s) => [s.id.sample, s.id.delay])).toEqual(v.map((x) => [x.sample, x.delay]));
  });

  it('prologue split: "three measured knocks" then, on the next beat, the fourth alone', async () => {
    const { m, fb } = await story();
    m.cue('knock-three');
    expect(fb.sfx.map((s) => s.id.sample)).toEqual([...MOTIF.knocks]);
    m.beat();
    m.cue('knock-beyond');
    expect(fb.sfx.at(-1)!.id.sample).toBe(MOTIF.beyond);
    expect(fb.sfx.at(-1)!.id.delay).toBe(0);
  });

  it('the fake speaker and the whisper are caption-only: no sound, no voice impersonation', async () => {
    const { m, fb } = await story();
    expect(m.cue('speaker')).toBe(false);
    expect(m.cue('whisper')).toBe(false);
    expect(fb.sfx).toHaveLength(0);
    expect(m.stats.cuesCaptionOnly).toBe(2);
  });

  it('no ghost sounds: a new beat, scene change, profile change, reset or backgrounding cancels every unfinished cue voice', async () => {
    for (const leave of [(m: AudioManager) => m.beat(), (m: AudioManager) => m.setScene('menu'), (m: AudioManager) => m.setStoryProfile('chapter-7'), (m: AudioManager) => m.reset(), (m: AudioManager) => m.setHidden(true)]) {
      const { m, fb } = await story();
      m.cue('knock-motif');
      expect(live(fb)).toHaveLength(4);
      leave(m);
      expect(live(fb)).toHaveLength(0);
      expect(m.pendingCueVoices()).toBe(0);
    }
  });

  it('rapid advance through knock beats leaves at most one cue’s voices alive', async () => {
    const { m, fb } = await story();
    for (let i = 0; i < 10; i++) {
      m.beat();
      m.cue(i % 2 ? 'knock-motif' : 'knock-three');
      expect(live(fb).length).toBeLessThanOrEqual(4);
    }
    m.beat();
    expect(live(fb)).toHaveLength(0);
  });

  it('a second cue in the same beat replaces the first (bounded voices)', async () => {
    const { m, fb } = await story();
    m.cue('knock-motif');
    m.cue('water');
    expect(live(fb)).toHaveLength(1);
  });

  it('cues are refused before unlock, in the intro, while paused and when muted; nothing is queued for later', async () => {
    const r = make();
    r.m.setStoryProfile('prologue');
    r.m.setScene('story');
    expect(r.m.cue('knock-three')).toBe(false);
    await r.m.unlock();
    expect(r.fb.sfx).toHaveLength(0); // unlocking never replays a refused cue
    r.m.setScene('paused');
    expect(r.m.cue('knock-three')).toBe(false);
    r.m.setScene('intro');
    expect(r.m.cue('knock-three')).toBe(false);
    expect(r.fb.sfx).toHaveLength(0);
  });

  it('profiles choose the bed and the single track; supernatural scenes have no music', async () => {
    const { m, fb, sc } = await story();
    expect(fb.ambience().bed).toBe('amb-cave');
    expect(fb.log.some((l) => l.startsWith('play'))).toBe(false);
    m.setStoryProfile('chapter-4');
    expect(fb.ambience().bed).toBe('amb-promenade');
    m.setStoryProfile('chapter-1');
    expect(fb.ambience().bed).toBe('amb-patio');
    expect(fb.log).toContain('play:menu');
    fb.resolveAll();
    await tick();
    expect(fb.log).toContain('fade:menu:0.45'); // low under the talk
    // The hand: the table track, still one source at a time.
    m.setScene('gameplay');
    sc.flushAll();
    fb.resolveAll();
    await tick();
    expect([...fb.audible]).toEqual(['gameplay']);
    expect(fb.ambience().bed).toBe('amb-patio');
    // Back to a no-music profile: the track fades out and nothing replaces it.
    m.setStoryProfile('chapter-5');
    m.setScene('story');
    sc.flushAll();
    expect(fb.audible.size).toBe(0);
    expect(fb.ambience().bed).toBe('amb-jungle');
  });

  it('surf swells the bed only for its beat; ambience-off holds for the scene and is a replayable state cue', async () => {
    const { m, fb } = await story();
    m.setStoryProfile('chapter-4');
    const base = fb.ambience().level;
    m.cue('surf');
    expect(fb.ambience().level).toBeGreaterThan(base);
    m.beat();
    expect(fb.ambience().level).toBe(base);
    m.setStoryProfile('epilogue');
    m.cue('ambience-off');
    expect(fb.ambience().bed).toBeNull();
    m.beat();
    expect(fb.ambience().bed).toBeNull();
    expect(STATE_CUES.has('ambience-off')).toBe(true);
    expect(STATE_CUES.has('knock-motif')).toBe(false); // one-shots never replay on resume
  });

  it('silent caption changes never duck or touch the music', async () => {
    const { m, fb } = await story();
    m.setStoryProfile('chapter-1');
    fb.resolveAll();
    await tick();
    const before = fb.log.length;
    for (let i = 0; i < 20; i++) m.beat();
    expect(fb.log.slice(before).filter((l) => l.startsWith('fade') || l.startsWith('play') || l.startsWith('pause'))).toEqual([]);
  });

  it('the user’s levels stay authoritative: profiles and cues never change bus gains', async () => {
    const { m, fb } = await story({ music: 0.2, ambience: 0.3, sfx: 0.4 });
    const g = { ...fb.gains };
    m.setStoryProfile('chapter-1');
    m.cue('surf');
    m.cue('knock-motif');
    m.beat();
    expect(fb.gains).toEqual(g);
  });

  it('backgrounding drops the bed; foregrounding restores the current scene’s bed and track', async () => {
    const { m, fb } = await story();
    m.setHidden(true);
    expect(fb.ambienceOn()).toBe(false);
    m.setHidden(false);
    await tick();
    expect(fb.ambience().bed).toBe('amb-cave');
  });

  it('a pause keeps no bed; resuming the hand restores the profile’s hand mix', async () => {
    const { m, fb } = await story();
    m.setScene('gameplay');
    expect(fb.ambience().bed).toBe('amb-cave');
    m.setScene('paused');
    expect(fb.ambienceOn()).toBe(false);
    m.setScene('gameplay');
    expect(fb.ambience().bed).toBe('amb-cave');
  });
});
