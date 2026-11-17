import { describe, expect, it } from 'vitest';
import { RUNTIME_ASSET_URLS } from '../assets/urls';
import type { Scene } from './parse';
import { SCENE_IDS } from './progress';
import { STAGING } from './staging';
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
