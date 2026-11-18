/**
 * Chapter structure for NO REST FOR COUSIN, derived from the approved script.
 *
 * Each chapter's blocks are split, in script order, into:
 *   pre      — everything before the [DEAL …] cue (shown before the hand)
 *   deal     — the cue itself (enters the hand)
 *   optional — "Optional table lines" (flavour; never required, not shown in the main flow)
 *   inserts  — Win / Loss / Tie: only the one matching the hand result is shown
 *   post     — the common continuation after the inserts (all routes rejoin)
 *   notebook — the closing notebook entry (chapters 1–6)
 * The hands use the frozen rules presets unchanged. Seats are named; nothing is
 * scripted about the tiles and the computer players use the ordinary fair AI.
 */
import type { ModeId, SeatIndex } from '../engine/types';
import type { Block, Scene } from './parse';

export type Outcome = 'win' | 'loss' | 'tie';

export interface HandSetup {
  readonly mode: ModeId;
  /** Display names by seat. Seat 0 is always the player, Roberto "Cousin". */
  readonly seatNames: Readonly<Partial<Record<SeatIndex, string>>>;
  /** Short line for the scene card, e.g. "Draw versus Tío Rafa". Comes from the script's own Hand field. */
  readonly label: string;
}

/**
 * The seven encounters as the script specifies them (its "**Hand:**" field and DEAL cue).
 * Partnership seats: partners sit across (0 & 2 vs 1 & 3).
 * `chapters.test.ts` checks every entry against the script text.
 */
export const HANDS: Readonly<Record<string, HandSetup>> = {
  'chapter-1': { mode: 'draw2', seatNames: { 0: 'Cousin', 1: 'Tío Rafa' }, label: 'Draw versus Tío Rafa' },
  'chapter-2': { mode: 'block2', seatNames: { 0: 'Cousin', 1: 'Marisol' }, label: 'Block versus Marisol' },
  'chapter-3': { mode: 'partnership4', seatNames: { 0: 'Cousin', 1: 'Vale', 2: 'Marisol', 3: 'Rafa' }, label: 'Partnership: Cousin + Marisol versus Vale + Rafa' },
  'chapter-4': { mode: 'draw2', seatNames: { 0: 'Cousin', 1: 'Rafa' }, label: 'Draw versus Rafa' },
  'chapter-5': { mode: 'block2', seatNames: { 0: 'Cousin', 1: 'Luz' }, label: 'Block versus Luz' },
  'chapter-6': { mode: 'draw2', seatNames: { 0: 'Cousin', 1: 'Marisol' }, label: 'Draw versus Marisol' },
  'chapter-7': { mode: 'partnership4', seatNames: { 0: 'Cousin', 1: 'Vale', 2: 'Marisol', 3: 'Rafa' }, label: 'Partnership: Cousin + Marisol versus Vale + Rafa' },
};

export interface Segments {
  readonly pre: readonly Block[];
  readonly deal: Block | null;
  readonly optional: readonly Block[];
  readonly inserts: Readonly<Partial<Record<Outcome, Block>>>;
  readonly post: readonly Block[];
  readonly notebook: Block | null;
}

const shown = (b: Block) => b.kind === 'line' || b.kind === 'direction';

export function segments(scene: Scene): Segments {
  const dealAt = scene.blocks.findIndex((b) => b.kind === 'deal');
  if (dealAt < 0) return { pre: scene.blocks.filter(shown), deal: null, optional: [], inserts: {}, post: [], notebook: null };
  const after = scene.blocks.slice(dealAt + 1);
  const lastInsert = after.reduce((m, b, i) => (b.kind === 'insert' ? i : m), -1);
  const inserts: Partial<Record<Outcome, Block>> = {};
  for (const b of after) if (b.kind === 'insert' && b.result) inserts[b.result] = b;
  return {
    pre: scene.blocks.slice(0, dealAt).filter(shown),
    deal: scene.blocks[dealAt]!,
    optional: after.slice(0, Math.max(0, lastInsert)).filter((b) => b.kind === 'optional'),
    inserts,
    post: after.slice(lastInsert + 1).filter(shown),
    notebook: scene.blocks.find((b) => b.kind === 'notebook') ?? null,
  };
}

/** An insert paragraph ("**Win insert:** RAFA: “…” COUSIN: “…”") split into its spoken lines, verbatim. */
export function insertLines(insert: Block): Block[] {
  const body = insert.raw.replace(/^\*\*(Win|Loss|Tie) insert:\*\*\s*/, '');
  const out: Block[] = [];
  // Speaker tags followed by a quoted line; bracketed directions stay as captions.
  const re = /\[[^\]]*\]|([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ .'’]*(?:, [a-z ]+)?): (“[^”]*”)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    if (m[0].startsWith('[')) out.push({ kind: 'direction', raw: m[0] });
    else out.push({ kind: 'line', raw: m[0], speaker: m[1]!, text: m[2]! });
  }
  return out;
}

export function outcomeFor(winnerTeam: number | null, playerTeam: number): Outcome {
  return winnerTeam === null ? 'tie' : winnerTeam === playerTeam ? 'win' : 'loss';
}
