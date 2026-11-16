/**
 * Parser for the approved NO REST FOR COUSIN script (docs/STORY_SCRIPT.md §4).
 * Pure and verbatim: each block's `raw` is the exact source paragraph (or
 * list item); classification never edits text.
 */
export type BlockKind = 'direction' | 'line' | 'deal' | 'optional-heading' | 'optional' | 'insert' | 'notebook' | 'meta' | 'note';

export interface Block {
  readonly kind: BlockKind;
  /** Exact source text (no trimming beyond the line break that ends it). */
  readonly raw: string;
  /** For `line`: the script's speaker tag (e.g. COUSIN, MARISOL, "WORKER, text"). */
  readonly speaker?: string;
  /** For `line`: the spoken text after the tag, verbatim. */
  readonly text?: string;
  /** For `insert`: which hand result it belongs to. */
  readonly result?: 'win' | 'loss' | 'tie';
}

export interface Scene {
  readonly id: string; // prologue | chapter-1 … chapter-7 | epilogue
  readonly number: number | null;
  readonly heading: string; // exact heading text, e.g. "Chapter 1 — Retirement Is a Scheduling Error"
  readonly title: string; // after the dash
  readonly location: string | null;
  readonly hand: string | null;
  readonly purpose: string | null;
  readonly blocks: readonly Block[];
}

export interface Story {
  readonly preface: string;
  readonly scenes: readonly Scene[];
}

/** Section 4 of the document, exactly as written. */
export function scriptSection(md: string): string {
  const start = md.indexOf('## 4. Complete revised working script');
  const end = md.indexOf('\n## 5. ', start);
  if (start < 0 || end < 0) throw new Error('script section 4 not found');
  return md.slice(start, end + 1);
}

const LINE = /^([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ .'’]*(?:, [a-z ]+)?): (.*)$/s;
const field = (meta: string, name: string): string | null => {
  const m = meta.match(new RegExp(`\\*\\*${name}:\\*\\*\\s*(.*?)(?=\\s*\\*\\*[A-Z][a-z]+:\\*\\*|$)`, 's'));
  return m ? m[1]!.trim() : null;
};

export function classify(raw: string): Block {
  if (/^\[DEAL[:.]/.test(raw)) return { kind: 'deal', raw };
  if (raw.startsWith('[')) return { kind: 'direction', raw };
  if (raw.startsWith('**Location:**')) return { kind: 'meta', raw };
  const ins = raw.match(/^\*\*(Win|Loss|Tie) insert:\*\*\s/);
  if (ins) return { kind: 'insert', raw, result: ins[1]!.toLowerCase() as 'win' | 'loss' | 'tie' };
  if (raw.startsWith('Notebook:')) return { kind: 'notebook', raw };
  if (/^Optional table lines:/.test(raw)) return { kind: 'optional-heading', raw };
  if (raw.startsWith('- ')) return { kind: 'optional', raw };
  const m = raw.match(LINE);
  if (m) return { kind: 'line', raw, speaker: m[1]!, text: m[2]! };
  return { kind: 'note', raw };
}

export function parseScript(md: string): Story {
  const section = scriptSection(md);
  const parts = section.split(/\n(?=### )/);
  const preface = parts[0]!;
  const scenes: Scene[] = [];
  for (const part of parts.slice(1)) {
    const lines = part.split('\n');
    const heading = lines[0]!.replace(/^### /, '');
    const blocks: Block[] = [];
    // Paragraphs are separated by blank lines; list items are separate blocks.
    let para: string[] = [];
    const flush = () => {
      if (para.length) blocks.push(classify(para.join('\n')));
      para = [];
    };
    for (const l of lines.slice(1)) {
      if (l.trim() === '') flush();
      else if (l.startsWith('- ')) {
        flush();
        blocks.push(classify(l));
      } else para.push(l);
    }
    flush();
    const meta = blocks.find((b) => b.kind === 'meta')?.raw ?? '';
    const chapter = heading.match(/^Chapter (\d+)/);
    scenes.push({
      id: chapter ? `chapter-${chapter[1]}` : heading.startsWith('Prologue') ? 'prologue' : heading.startsWith('Epilogue') ? 'epilogue' : heading.toLowerCase().replace(/\W+/g, '-'),
      number: chapter ? Number(chapter[1]) : null,
      heading,
      title: heading.split(' — ').slice(1).join(' — ') || heading,
      location: field(meta, 'Location'),
      hand: field(meta, 'Hand'),
      purpose: field(meta, 'Purpose'),
      blocks,
    });
  }
  return { preface, scenes };
}

/** Rebuild section 4's text from parsed blocks (proves nothing was rewritten or dropped). */
export function blocksText(story: Story): string[] {
  const out = story.preface.split('\n').filter((l) => l.trim() !== '');
  for (const s of story.scenes) {
    out.push(`### ${s.heading}`);
    for (const b of s.blocks) out.push(...b.raw.split('\n'));
  }
  return out;
}
