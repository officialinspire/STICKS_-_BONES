/**
 * npm run story:build — extract the approved script (docs/STORY_SCRIPT.md,
 * section 4 "Complete revised working script") into src/story/script.json.
 *
 * The script is authoritative and is NEVER rewritten: every block keeps its
 * exact source text in `raw`; parsing only adds structure (kind, speaker,
 * insert result). `src/story/script.test.ts` proves that the blocks, joined,
 * reproduce section 4 line-for-line and that the JSON matches the current
 * script hash.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseScript } from '../src/story/parse.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const md = readFileSync(`${root}docs/STORY_SCRIPT.md`, 'utf8');
const story = parseScript(md);
const json = { source: 'docs/STORY_SCRIPT.md', version: 'v0.2', sourceSha256: createHash('sha256').update(md).digest('hex'), ...story };
writeFileSync(`${root}src/story/script.json`, JSON.stringify(json) + '\n');
console.log(`story: ${story.scenes.length} scenes, ${story.scenes.reduce((s, x) => s + x.blocks.length, 0)} blocks, ${JSON.stringify(json).length} bytes`);
