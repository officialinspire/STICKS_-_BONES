import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { blocksText, parseScript, scriptSection } from './parse';
import script from './script.json';

const md = readFileSync(new URL('../../docs/STORY_SCRIPT.md', import.meta.url), 'utf8');

describe('approved script v0.2 → script.json', () => {
  it('script.json was built from the current docs/STORY_SCRIPT.md (run npm run story:build after any edit)', () => {
    expect(script.sourceSha256).toBe(createHash('sha256').update(md).digest('hex'));
  });

  it('is verbatim: the parsed blocks reproduce every non-empty line of section 4, in order', () => {
    const source = scriptSection(md).split('\n').filter((l) => l.trim() !== '');
    expect(blocksText(parseScript(md))).toEqual(source);
    expect(blocksText(script as never)).toEqual(source);
  });

  it('has the approved structure: prologue, seven chapters with a hand, three outcome inserts and (1–6) a notebook entry, epilogue', () => {
    const ids = script.scenes.map((s) => s.id);
    expect(ids).toEqual(['prologue', 'chapter-1', 'chapter-2', 'chapter-3', 'chapter-4', 'chapter-5', 'chapter-6', 'chapter-7', 'epilogue']);
    for (const s of script.scenes.filter((x) => x.number !== null)) {
      expect(s.hand, s.id).toBeTruthy();
      expect(s.location, s.id).toBeTruthy();
      expect(s.blocks.filter((b) => b.kind === 'deal'), `${s.id} DEAL`).toHaveLength(1);
      expect(s.blocks.filter((b) => b.kind === 'insert').map((b) => b.result).sort(), `${s.id} inserts`).toEqual(['loss', 'tie', 'win']);
      // Chapters 1–6 end with a notebook entry; chapter 7 closes the case and the script gives it none.
      expect(s.blocks.some((b) => b.kind === 'notebook'), `${s.id} notebook`).toBe(s.number! <= 6);
    }
    const prologue = script.scenes[0]!;
    expect(prologue.hand).toBeNull();
  });

  it('modes follow the approved plan: three Draw, two Block, two Partnership', () => {
    const modes = script.scenes.filter((s) => s.number !== null).map((s) => (/^Draw/.test(s.hand!) ? 'draw' : /^Block/.test(s.hand!) ? 'block' : /^Partnership/.test(s.hand!) ? 'partnership' : '?'));
    expect(modes.filter((m) => m === 'draw')).toHaveLength(3);
    expect(modes.filter((m) => m === 'block')).toHaveLength(2);
    expect(modes.filter((m) => m === 'partnership')).toHaveLength(2);
  });
});
