import { describe, expect, it } from 'vitest';
import { PORTRAIT_URLS, RUNTIME_ASSET_URLS } from '../assets/urls';
import { HANDS } from './chapters';
import type { Scene } from './parse';
import { SCENE_IDS } from './progress';
import { STAGING } from './staging';
import { CAST_BY_SPEAKER, sceneAssets, sceneCast } from '../ui/story-assets';
import { SCENE_IMAGES } from './scene-images';
import { envKey } from '../assets/env';
import script from './script.json';

const scenes = script.scenes as unknown as Scene[];

describe('cinematic staging is anchored to the approved script', () => {
  it('every cue anchor matches exactly one stage direction of its scene, verbatim', () => {
    for (const id of SCENE_IDS) {
      const scene = scenes.find((s) => s.id === id)!;
      for (const c of STAGING[id].cues) {
        const hits = scene.blocks.filter((b) => b.raw.startsWith(c.at));
        expect(hits.length, `${id}: "${c.at}"`).toBe(1);
        expect(hits[0]!.kind, `${id}: "${c.at}"`).toBe('direction');
      }
    }
  });

  it('every scene backdrop is a bundled runtime image', () => {
    for (const id of SCENE_IDS) {
      const env = STAGING[id].env;
      if (env) expect(Object.keys(RUNTIME_ASSET_URLS), id).toContain(env);
      for (const c of STAGING[id].cues) for (const cue of c.cues) if (cue.kind === 'backdrop' && cue.env) expect(Object.keys(RUNTIME_ASSET_URLS)).toContain(cue.env);
    }
  });

  it('chapter 6 is never played on the ancient platform', () => {
    expect(STAGING['chapter-6'].env).toBe('env.cave-waterfall');
    expect(STAGING['chapter-6'].handEnv).toBeNull(); // the hand uses the modern rest-area grade, not the cave image
    expect(STAGING['chapter-6'].handNote).toMatch(/rest area/);
  });
});


describe('cast scene assignments', () => {
  it('every scripted speaker either has a cast sheet or is a known art-less role (name tag only)', () => {
    const artless = new Set(['COUSIN', 'WORKER', 'SPEAKER', 'VOICE', 'REPRESENTATIVE']);
    for (const sc of script.scenes as unknown as Scene[])
      for (const b of sc.blocks) if (b.kind === 'line') {
        const who = b.speaker!.split(',')[0]!.trim();
        expect(who in CAST_BY_SPEAKER || artless.has(who)).toBe(true);
      }
  });
  it('assigns the cast each scene actually uses', () => {
    const of = (id: string) => sceneCast((script.scenes as unknown as Scene[]).find((s) => s.id === id)!).sort();
    expect(of('prologue')).toEqual([]);
    expect(of('chapter-1')).toEqual(['cast.marisol.atlas', 'cast.rafa.atlas']);
    expect(of('chapter-5')).toEqual(['cast.luz.atlas', 'cast.marisol.atlas']);
    expect(of('chapter-7')).toEqual(['cast.marisol.atlas', 'cast.rafa.atlas', 'cast.vale.atlas']);
    expect(of('epilogue')).toEqual(['cast.marisol.atlas']);
  });
});

describe('scene image map (core bundle) matches what the Story layer loads', () => {
  it('for every scene, in both orientations', () => {
    for (const sc of script.scenes as unknown as Scene[]) {
      const m = SCENE_IMAGES[sc.id as keyof typeof SCENE_IMAGES];
      for (const portrait of [false, true]) {
        const want = [...m.env.map((e) => envKey(e, portrait)), ...m.cast].sort();
        const got = (portrait ? sceneAssetsFor(sc, true) : sceneAssetsFor(sc, false)).sort();
        expect(got).toEqual(want);
      }
    }
  });
});
function sceneAssetsFor(sc: Scene, portrait: boolean) {
  const mm = globalThis.matchMedia;
  globalThis.matchMedia = ((q: string) => ({ matches: portrait, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof matchMedia;
  try {
    return sceneAssets(sc);
  } finally {
    globalThis.matchMedia = mm;
  }
}

describe('every story hand has an explicit, mapped backdrop', () => {
  const handScenes = SCENE_IDS.filter((id) => HANDS[id]);

  it('each chapter with a hand names its table backdrop explicitly (no table falls back to the patio)', () => {
    expect(handScenes).toHaveLength(7);
    for (const id of handScenes) expect('handEnv' in STAGING[id], `${id} handEnv`).toBe(true);
  });

  it("each hand is played at its chapter's location; Chapter 6 at the drawn rest area, never the platform", () => {
    for (const id of handScenes) {
      const h = STAGING[id].handEnv;
      if (id === 'chapter-6') expect(h).toBeNull();
      else expect(h, id).toBe(STAGING[id].env);
    }
    expect(STAGING['chapter-3'].env).toBe('env.executive-terrace');
    expect(STAGING['chapter-3'].handEnv).toBe('env.executive-terrace');
    expect(STAGING['chapter-7'].handEnv).toBe('env.executive-terrace');
  });

  it('every hand backdrop is preloaded, offline-mapped and has both derivatives (full frame and 3:4 crop)', () => {
    for (const id of handScenes) {
      const h = STAGING[id].handEnv;
      if (!h) continue;
      expect(SCENE_IMAGES[id].env, id).toContain(h);
      expect(RUNTIME_ASSET_URLS[h as keyof typeof RUNTIME_ASSET_URLS], h).toBeTruthy();
      expect(PORTRAIT_URLS[`${h}@portrait` as keyof typeof PORTRAIT_URLS], h).toBeTruthy();
    }
  });

  it('the retired leisure resort is referenced nowhere in staging, preload or offline data', () => {
    const all = JSON.stringify({ STAGING, SCENE_IMAGES, urls: Object.keys(RUNTIME_ASSET_URLS) });
    expect(all).not.toMatch(/resort-patio/);
  });
});
