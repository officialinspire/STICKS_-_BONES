/**
 * Pure presentation helpers: hand sorting, control availability with
 * human-readable reasons, and tile labels. No DOM here.
 */
import type { ModeRules } from '../engine/rules/presets';
import { tileFromId } from '../engine/tiles';
import type { TileId } from '../engine/types';
import type { SeatView } from '../engine/view';

export type SortMode = 'value' | 'doubles' | 'drawn';
export const SORT_MODES: readonly SortMode[] = ['value', 'doubles', 'drawn'];
export const SORT_LABELS: Record<SortMode, string> = { value: 'Sort: by value', doubles: 'Sort: doubles first', drawn: 'Sort: as dealt' };

export function sortHand(hand: readonly TileId[], mode: SortMode): TileId[] {
  if (mode === 'drawn') return [...hand];
  return [...hand].sort((a, b) => {
    const ta = tileFromId(a);
    const tb = tileFromId(b);
    if (mode === 'doubles') {
      const da = ta.high === ta.low ? 1 : 0;
      const db = tb.high === tb.low ? 1 : 0;
      if (da !== db) return db - da;
    }
    return tb.high - ta.high || tb.low - ta.low;
  });
}

const NUM = ['blank', 'one', 'two', 'three', 'four', 'five', 'six'];
export function tileLabel(id: TileId): string {
  const t = tileFromId(id);
  return t.high === t.low ? `double ${NUM[t.high]}` : `${NUM[t.high]}–${NUM[t.low]}`;
}
export function tileShort(id: TileId): string {
  const t = tileFromId(id);
  return `${t.high}|${t.low}`;
}

export interface ControlState {
  readonly enabled: boolean;
  readonly reason: string;
}

/** Draw / pass availability for the viewing seat, with a reason whenever disabled. */
export function controlStates(view: SeatView, rules: ModeRules, waitingFor: string): { draw: ControlState; pass: ControlState } {
  const hasBoneyard = rules.noMove.kind === 'draw-until-playable';
  const off = (reason: string): ControlState => ({ enabled: false, reason });
  if (view.phase !== 'playing') return { draw: off('The hand is over.'), pass: off('The hand is over.') };
  if (view.turn !== view.viewer) {
    const r = `Waiting for ${waitingFor}.`;
    return { draw: off(r), pass: off(r) };
  }
  if (view.legalMoves.length) {
    const r = 'You have a playable tile — you must play it.';
    return { draw: off(r), pass: off(r) };
  }
  if (hasBoneyard && view.boneyardCount > 0)
    return {
      draw: { enabled: true, reason: 'No playable tile: draw from the boneyard.' },
      pass: off(`You can’t pass yet — the boneyard still has ${view.boneyardCount} tile${view.boneyardCount === 1 ? '' : 's'}.`),
    };
  return {
    draw: off(hasBoneyard ? 'The boneyard is empty.' : `${rules.name} has no drawing.`),
    pass: { enabled: true, reason: 'No playable tile: pass.' },
  };
}

/** Why a tile in hand can't be played right now (null if it can). */
export function whyNotPlayable(view: SeatView, id: TileId): string | null {
  if (view.phase !== 'playing') return 'The hand is over.';
  if (view.turn !== view.viewer) return 'It isn’t your turn.';
  if (view.legalMoves.some((m) => m.tile === id)) return null;
  if (!view.openEnds) {
    if (view.requirement.kind === 'tile') return `This hand must open with ${tileShort(view.requirement.tile)}.`;
    return 'This tile can’t lead.';
  }
  return `${tileShort(id)} doesn’t match the open ends (${view.openEnds.head} and ${view.openEnds.tail}).`;
}
