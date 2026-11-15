/**
 * Test support: build a specific mid-hand MatchState and verify it is a legal,
 * consistent state before handing it to a test. Not used by the app.
 */
import { createMatchConfig } from '../config';
import { checkInvariants } from '../invariants';
import { deal } from '../deal';
import { createMatchWithDeal } from '../match';
import type { PlacedTile } from '../line';
import { seedRng } from '../rng';
import { COUSINS_HOUSE_RULES_V1 } from '../rules/presets';
import type { MatchState } from '../state';
import { CANONICAL_TILE_IDS } from '../tiles';
import type { ModeId, Pip, SeatIndex, TargetScore, TileId } from '../types';

export interface CraftSpec {
  readonly mode: ModeId;
  readonly hands: readonly (readonly string[])[];
  /** Head → tail: [tile, headPip, tailPip]. All tiles are credited to `opener`. */
  readonly line?: readonly (readonly [string, number, number])[];
  /** Boneyard order (draw mode) — draws take from the front. Omitted tiles are appended in canonical order. */
  readonly stock?: readonly string[];
  readonly turn: number;
  readonly opener?: number;
  readonly scores?: readonly number[];
  readonly targetScore?: TargetScore;
  readonly consecutivePasses?: number;
  readonly seed?: string;
}

export function craft(spec: CraftSpec): MatchState {
  const rules = COUSINS_HOUSE_RULES_V1.modes[spec.mode];
  const cfg = createMatchConfig({ mode: spec.mode, ...(spec.targetScore ? { targetScore: spec.targetScore } : {}) });
  if (!cfg.ok) throw new Error('craft: bad config');
  const base = createMatchWithDeal(cfg.config, deal(rules, seedRng('craft-base')), spec.seed ?? 'craft');
  if (!base.ok) throw new Error(base.errors.join('; '));
  const opener = (spec.opener ?? spec.turn) as SeatIndex;
  const lineTiles: PlacedTile[] = (spec.line ?? []).map(([tile, headPip, tailPip], i) => ({
    tile: tile as TileId,
    headPip: headPip as Pip,
    tailPip: tailPip as Pip,
    crosswise: tile[1] === tile[2],
    seat: opener,
    playIndex: i,
  }));
  const used = new Set<string>([...spec.hands.flat(), ...lineTiles.map((t) => t.tile)]);
  const explicitStock = spec.stock ?? [];
  explicitStock.forEach((t) => used.add(t));
  const rest = CANONICAL_TILE_IDS.filter((t) => !used.has(t));
  const stock = [...explicitStock, ...rest] as TileId[];
  const state: MatchState = {
    ...base.state,
    scores: spec.scores ?? base.state.scores,
    hand: {
      ...base.state.hand,
      hands: spec.hands.map((h) => [...h] as TileId[]),
      stock,
      line: { tiles: lineTiles },
      opener,
      openingRule: 'previous-winner',
      requirement: { kind: 'any' },
      turn: spec.turn as SeatIndex,
      consecutivePasses: spec.consecutivePasses ?? 0,
      drawsThisTurn: 0,
    },
  };
  const problems = checkInvariants(state);
  if (problems.length) throw new Error(`craft produced an invalid state: ${problems.join('; ')}`);
  return state;
}

/** Tiles not in any of the given lists. */
export function complement(...lists: readonly (readonly string[])[]): string[] {
  const used = new Set(lists.flat());
  return CANONICAL_TILE_IDS.filter((t) => !used.has(t));
}

/**
 * Arrange tiles into a valid chain (Hierholzer's algorithm on the pip graph),
 * starting from `startPip`. Throws if no single chain uses every tile.
 */
export function chain(tiles: readonly string[], startPip: number): [string, number, number][] {
  const unused = new Set(tiles);
  const adj = (pip: number) => [...unused].filter((t) => Number(t[1]) === pip || Number(t[2]) === pip).sort();
  const stack: { pip: number; tile: string | null }[] = [{ pip: startPip, tile: null }];
  const out: { pip: number; tile: string | null }[] = [];
  while (stack.length) {
    const top = stack[stack.length - 1]!;
    const next = adj(top.pip)[0];
    if (next) {
      unused.delete(next);
      const other = Number(next[1]) === top.pip ? Number(next[2]) : Number(next[1]);
      stack.push({ pip: other, tile: next });
    } else out.push(stack.pop()!);
  }
  if (unused.size) throw new Error(`chain: ${unused.size} tiles could not be chained from ${startPip}`);
  out.reverse();
  const result: [string, number, number][] = [];
  for (let i = 1; i < out.length; i++) result.push([out[i]!.tile!, out[i - 1]!.pip, out[i]!.pip]);
  return result;
}
