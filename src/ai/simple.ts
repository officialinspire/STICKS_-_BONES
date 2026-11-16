/**
 * "Cousin" v1 AI. Fair by construction: it receives only a SeatView (its own
 * hand plus public information) and returns a command. Deterministic.
 *
 * Heuristic: when it can play, prefer shedding doubles, then heavy tiles, then
 * moves that leave an open end it still holds tiles for.
 */
import type { Command } from '../engine/commands';
import type { Placement } from '../engine/line';
import { tileFromId } from '../engine/tiles';
import type { SeatView } from '../engine/view';

function score(view: SeatView, m: Placement): number {
  const t = tileFromId(m.tile);
  const isDouble = t.high === t.low;
  let s = t.high + t.low + (isDouble ? 6 : 0);
  // Which pip will this leave open at the end it is played on?
  const leaves = view.openEnds ? (m.end === 'head' ? m.headPip : m.tailPip) : null;
  const other = view.openEnds ? (m.end === 'head' ? view.openEnds.tail : view.openEnds.head) : null;
  const rest = view.myHand.filter((id) => id !== m.tile).map(tileFromId);
  const follow = rest.filter((x) => (leaves !== null && (x.high === leaves || x.low === leaves)) || (other !== null && (x.high === other || x.low === other))).length;
  s += follow * 1.5;
  return s;
}

export function chooseCommand(view: SeatView, canDraw: boolean): Command | null {
  if (view.phase !== 'playing' || view.turn !== view.viewer) return null;
  if (view.legalMoves.length) {
    let best = view.legalMoves[0]!;
    let bestScore = -Infinity;
    for (const m of view.legalMoves) {
      const s = score(view, m);
      if (s > bestScore) {
        best = m;
        bestScore = s;
      }
    }
    return { type: 'play', seq: view.seq, seat: view.viewer, tile: best.tile, end: best.end };
  }
  if (canDraw && view.boneyardCount > 0) return { type: 'draw', seq: view.seq, seat: view.viewer };
  return { type: 'pass', seq: view.seq, seat: view.viewer };
}
