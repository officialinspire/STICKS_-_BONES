/**
 * Dialogue expressions for NO REST FOR COUSIN: presentation only (never dialogue, rules or tiles).
 *
 * 1. **A semantic vocabulary** (`Expression`) that dialogue lines are tagged with.
 * 2. **Each character's VERIFIED frames** (`FRAMES`), mapped by visual inspection of the actual sprite
 *    cells. The cast sheets' generated cell order was NOT trusted: every frame was cropped and looked at
 *    (docs/ASSETS.md "Expression verification").
 *    - An expression a character's art doesn't have uses that character's neutral fallback. That's
 *      their composed default, or for Roberto his calm or contemplative frame.
 *    - So no line ever shows a guessed or mismatched face.
 * 3. **The line table** (`LINES`): stable dialogue ids (`<scene>#<n>`, n = the n-th spoken line of the
 *    scene in script order, outcome-insert lines included) → expression.
 *    - Chosen from each line's own words and the script's stage directions; nothing is random.
 *    - Lines not listed are neutral. For Roberto, an unlisted line keeps the mood the stage directions
 *      set (staging.ts expr cues).
 *    - `expressions.test.ts` pins every id to its speaker and opening text, so a script change can't
 *      silently move an expression onto another line.
 */
import { insertLines } from './chapters';
import type { Block, Scene } from './parse';
import type { Mood } from './staging';

export type Expression =
  | 'neutral'
  | 'teasing'
  | 'concern'
  | 'firmness'
  | 'vulnerability'
  | 'affection'
  | 'menace'
  | 'fear'
  | 'amusement'
  | 'surprise'
  | 'suspicion'
  | 'pride'
  | 'wistful'
  | 'thinking'
  | 'explaining'
  | 'delight'
  | 'charm';

export type Character = 'roberto' | 'vale' | 'luz' | 'marisol' | 'rafa';
export type CastFrameId = 'e1' | 'e2' | 'e3' | 'e4' | 'e5' | 'e6' | 'e7' | 'e8';

/**
 * Verified meanings (what each cell actually shows), by visual inspection:
 * - **Vale:**
 *   - e1 composed, level gaze · e2 pleasant public smile · e3 appraising, one brow raised · e4 self-satisfied, chin up
 *   - e5 cool, narrowed eyes · e6 hard stare, brows down · e7 startled, eyes wide · e8 tight smirk
 * - **Luz:**
 *   - e1 calm, attentive · e2 warm smile · e3 serious, brows drawn · e4 speaking, mouth open
 *   - e5 concerned, brows raised · e6 firm, level · e7 gentle closed smile · e8 knowing soft smile, eyes narrowed
 * - **Marisol:**
 *   - e1 composed, slight smile · e2 wry half-smile, eyes squinted · e3 worried, brows raised, lips parted · e4 determined, set jaw
 *   - e5 pained, brows tilted · e6 warm smile · e7 suspicious frown · e8 broad laughing smile
 * - **Rafa:**
 *   - e1 calm, looking off · e2 laughing · e3 sly grin · e4 looking up, wistful
 *   - e5 sad, brows tilted · e6 downcast, eyes lowered · e7 proud, chin up · e8 broad warm smile
 * - **Roberto** (cousin.atlas.portrait; frame ids are the manifest's, each verified):
 *   - neutral: calm closed smile · smirk: sly smirk, head tilt · thinking: hand on chin, mouth set · explaining: open hand, speaking
 *   - laughing: open laugh · surprised: "ooh", palms up · delighted: wide grin, palms up · pumped: grin, fists at chest
 *   - He has no somber, frightened or hostile frame; those fall back to thinking or neutral.
 */
export const FRAMES: {
  readonly roberto: Readonly<Record<Expression, Mood>>;
  readonly vale: Readonly<Partial<Record<Expression, CastFrameId>>>;
  readonly luz: Readonly<Partial<Record<Expression, CastFrameId>>>;
  readonly marisol: Readonly<Partial<Record<Expression, CastFrameId>>>;
  readonly rafa: Readonly<Partial<Record<Expression, CastFrameId>>>;
} = {
  roberto: {
    neutral: 'neutral',
    teasing: 'smirk',
    amusement: 'laughing',
    delight: 'delighted',
    pride: 'pumped',
    surprise: 'surprised',
    thinking: 'thinking',
    explaining: 'explaining',
    // Closest available (contemplative, no grin) for the serious registers his art lacks.
    concern: 'thinking',
    vulnerability: 'thinking',
    wistful: 'thinking',
    // Neutral fallbacks (his calm frame).
    affection: 'neutral',
    firmness: 'neutral',
    fear: 'neutral',
    menace: 'neutral',
    suspicion: 'neutral',
    charm: 'neutral',
  },
  vale: { neutral: 'e1', charm: 'e2', amusement: 'e2', suspicion: 'e3', pride: 'e4', firmness: 'e5', menace: 'e6', fear: 'e7', surprise: 'e7', teasing: 'e8' },
  luz: { neutral: 'e1', amusement: 'e2', delight: 'e2', suspicion: 'e3', explaining: 'e4', concern: 'e5', fear: 'e5', firmness: 'e6', affection: 'e7', teasing: 'e8' },
  marisol: { neutral: 'e1', teasing: 'e2', concern: 'e3', fear: 'e3', firmness: 'e4', vulnerability: 'e5', affection: 'e6', suspicion: 'e7', amusement: 'e8', delight: 'e8' },
  rafa: { neutral: 'e1', amusement: 'e2', teasing: 'e3', wistful: 'e4', concern: 'e5', fear: 'e5', vulnerability: 'e6', pride: 'e7', firmness: 'e7', affection: 'e8', delight: 'e8' },
};

/** A cast member's frame for an expression: the verified frame, or their composed default (e1). */
export function castFrameFor(who: Exclude<Character, 'roberto'>, e: Expression): CastFrameId {
  return FRAMES[who][e] ?? 'e1';
}
/** Roberto's mood (HostView frame) for an expression. */
export function robertoMood(e: Expression): Mood {
  return FRAMES.roberto[e];
}

const T: Expression = 'teasing';
const A: Expression = 'amusement';
const C: Expression = 'concern';
const F: Expression = 'firmness';
const V: Expression = 'vulnerability';
const L: Expression = 'affection';
const M: Expression = 'menace';
const S: Expression = 'suspicion';
const H: Expression = 'thinking';
const D: Expression = 'delight';
const P: Expression = 'pride';
const X: Expression = 'explaining';
const CH: Expression = 'charm';

/** `<scene>#<n>` → expression. Unlisted lines are neutral (Roberto: the stage-direction mood). */
export const LINES: Readonly<Record<string, Readonly<Record<number, Expression>>>> = {
  'chapter-1': {
    2: T, 3: T, 4: A, 5: T, 6: T, 7: C, 8: H, 9: L, 10: A, 11: D, 12: C, 14: T, 15: T, 16: C, 17: V, 18: C, 19: F, 20: C, 21: F,
    23: V, 24: V, 25: L, 26: F, 27: T, 28: A, 30: 'surprise', 32: T, 33: T, 34: F, 36: P, 37: X, 38: T, 39: T, 40: T, 41: A, 42: A,
    43: T, 44: T, 45: A, 46: L, 47: D, 49: F, 50: L, 51: T, 52: T, 53: L, 54: L, 55: C, 56: H,
  },
  'chapter-2': {
    1: T, 2: D, 3: T, 4: A, 5: T, 6: L, 7: T, 8: T, 9: F, 10: T, 11: T, 13: F, 14: H, 15: S, 16: H, 17: S, 19: C, 20: CH, 21: F,
    22: F, 23: F, 24: M, 25: S, 26: M, 27: F, 28: T, 29: T, 31: F, 33: L, 34: T, 35: T, 36: T, 37: T, 38: A, 39: T, 40: A, 41: T,
    42: A, 43: S, 44: H, 45: F, 46: T, 47: T, 48: A,
  },
  'chapter-3': {
    1: F, 3: CH, 4: F, 5: CH, 6: T, 7: S, 8: T, 9: T, 10: T, 11: P, 12: S, 13: P, 14: H, 15: CH, 16: F, 17: F, 18: T, 19: F, 20: T,
    21: T, 22: CH, 23: D, 24: P, 25: T, 26: A, 27: CH, 28: T, 29: F, 31: F, 33: M, 34: M, 35: F, 36: CH, 37: C, 38: T, 39: C, 41: L,
    42: V,
  },
  'chapter-4': {
    1: P, 2: F, 5: C, 6: C, 7: H, 8: C, 9: H, 10: C, 12: C, 16: L, 17: 'wistful', 18: T, 19: T, 21: T, 22: A, 23: A, 24: L, 25: C,
    26: T, 27: F, 29: C, 30: V, 31: C, 32: V, 33: L, 34: V, 35: C, 36: V, 37: L, 38: T, 39: A, 40: T, 41: T, 42: D, 43: L, 44: T,
    45: C,
  },
  'chapter-5': {
    1: T, 2: T, 3: F, 4: A, 5: A, 6: S, 9: V, 10: C, 11: S, 12: X, 13: T, 14: H, 15: X, 16: S, 17: S, 18: H, 19: F, 20: X,
    21: 'surprise', 22: F, 23: F, 24: C, 25: F, 26: X, 27: T, 28: T, 29: T, 30: T, 31: L, 32: A, 33: A, 34: 'surprise', 35: T,
    38: 'fear', 39: F, 41: C, 42: F, 43: F, 44: F,
  },
  'chapter-6': {
    2: T, 3: F, 4: F, 5: F, 6: S, 7: S, 9: F, 12: C, 13: F, 15: C, 16: V, 17: C, 18: V, 19: V, 20: F, 21: F, 24: L, 25: V, 26: V,
    27: L, 28: T, 29: F, 31: F, 32: V, 33: L, 34: T, 35: T, 36: T, 37: L, 38: T, 39: T, 40: L, 41: D, 42: L, 43: T, 44: A, 45: T,
    46: A, 47: L, 49: F, 50: T, 51: T, 52: L,
  },
  'chapter-7': {
    1: F, 2: F, 3: F, 4: F, 5: T, 6: S, 7: P, 8: F, 9: P, 10: F, 11: M, 12: F, 13: F, 14: M, 15: H, 16: 'fear', 17: F, 18: F, 19: F,
    20: CH, 21: F, 22: F, 23: P, 24: F, 25: D, 26: F, 27: P, 28: F, 30: T, 32: F, 33: F, 35: M, 36: F, 37: C, 38: V, 39: L, 40: T,
    41: T, 42: V, 43: L, 44: P, 48: T, 49: L, 50: D,
  },
  epilogue: {
    1: T, 2: T, 3: T, 4: A, 5: L, 6: A, 7: T, 8: L, 9: T, 10: L, 11: L, 12: A, 13: C, 14: H, 15: L, 16: L, 17: T,
  },
};

/** The expression for line n of a scene (undefined: not tagged). */
export function lineExpression(sceneId: string, n: number): Expression | undefined {
  return LINES[sceneId]?.[n];
}

/**
 * Stable line numbers for a scene: every spoken line in script order, the outcome inserts' lines
 * included (as insertLines splits them). Scene blocks map by identity; insert lines (re-created by
 * insertLines) by speaker and text, which are unique among a scene's insert lines (tested).
 */
export function lineNumbers(scene: Scene): (b: Block) => number | undefined {
  const byBlock = new Map<Block, number>();
  const byInsert = new Map<string, number>();
  let n = 0;
  for (const b of scene.blocks) {
    if (b.kind === 'line') byBlock.set(b, ++n);
    else if (b.kind === 'insert') for (const x of insertLines(b)) if (x.kind === 'line') byInsert.set(`${x.speaker}|${x.text}`, ++n);
  }
  return (b) => byBlock.get(b) ?? (b.kind === 'line' ? byInsert.get(`${b.speaker}|${b.text}`) : undefined);
}
