/**
 * Presentation events returned by every accepted command. They describe what
 * happened; UI, audio and animation consume them but can never feed them back
 * into the rules. Some events carry private data: run them through
 * `redactEventsForSeat` before showing them to a particular seat.
 */
import type { EndId, OpenEnds, PlacedTile } from './line';
import type { OpeningRule, StockRule } from './rules/presets';
import type { HandEnd, HandResult, OpeningRequirement } from './state';

/** An opening requirement as seen by a seat that is not the opener. */
export type VisibleRequirement = OpeningRequirement | { readonly kind: 'hidden-tile' };

/** The opener's required tile is known only to the opener until it is played. */
export function requirementFor(req: OpeningRequirement, opener: SeatIndex, viewer: SeatIndex | null): VisibleRequirement {
  return req.kind === 'tile' && viewer !== opener ? { kind: 'hidden-tile' } : req;
}
import type { SeatIndex, TileId } from './types';

export type GameEvent =
  | {
      readonly type: 'hand-started';
      readonly handNumber: number;
      readonly opener: SeatIndex;
      readonly openingRule: OpeningRule['kind'];
      readonly requirement: VisibleRequirement;
      readonly handSizes: readonly number[];
      readonly stockCount: number;
      readonly stockKind: StockRule['kind'];
    }
  | { readonly type: 'turn'; readonly seat: SeatIndex }
  | {
      readonly type: 'tile-played';
      readonly seat: SeatIndex;
      readonly tile: TileId;
      readonly end: EndId;
      readonly placed: PlacedTile;
      readonly openEnds: OpenEnds;
      readonly handSize: number;
    }
  | {
      readonly type: 'tile-drawn';
      readonly seat: SeatIndex;
      /** Private to `seat`. Null after redaction for any other viewer. */
      readonly tile: TileId | null;
      readonly playable: boolean | null;
      readonly stockCount: number;
      readonly handSize: number;
    }
  | { readonly type: 'passed'; readonly seat: SeatIndex; readonly consecutivePasses: number }
  | { readonly type: 'hand-ended'; readonly end: HandEnd }
  | { readonly type: 'hand-resolved'; readonly result: HandResult; readonly scores: readonly number[] }
  | { readonly type: 'match-won'; readonly team: number; readonly scores: readonly number[] };

/** Hide other seats' private data. `viewer` null = spectator / shared screen. */
export function redactEventsForSeat(events: readonly GameEvent[], viewer: SeatIndex | null): GameEvent[] {
  return events.map((e) => {
    if (e.type === 'tile-drawn' && e.seat !== viewer) return { ...e, tile: null, playable: null };
    if (e.type === 'hand-started') return { ...e, requirement: requirementFor(e.requirement as OpeningRequirement, e.opener, viewer) };
    return e;
  });
}
