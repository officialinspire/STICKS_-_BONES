/**
 * The rules state machine: (state, command) → validated next state + events.
 *
 * Pure: never mutates its input, never reads clocks or ambient randomness,
 * never calls back into presentation. Rejected commands return the original
 * state untouched with a typed error.
 */
import type { Command, CommandError, CommandErrorCode } from './commands';
import { validateMatchConfig, type MatchConfig } from './config';
import { deal } from './deal';
import type { GameEvent } from './events';
import { EMPTY_LINE, END_IDS, openEnds, placeTile, placementsFor, type LineState, type Placement } from './line';
import { selectOpener } from './opening';
import { isRngState, seedRng, type RngState } from './rng';
import { getRulesPreset, type ModeRules } from './rules/presets';
import { scoreHand } from './scoring';
import { nextSeat } from './seats';
import {
  ENGINE_ID,
  MATCH_STATE_SCHEMA_VERSION,
  type HandResult,
  type HandState,
  type MatchState,
  type OpeningRequirement,
} from './state';
import { CANONICAL_TILE_IDS, parseTileId } from './tiles';
import type { SeatIndex, TileId } from './types';

export type ApplyResult =
  | { readonly ok: true; readonly state: MatchState; readonly events: readonly GameEvent[] }
  | { readonly ok: false; readonly state: MatchState; readonly error: CommandError };

export type CreateResult =
  | { readonly ok: true; readonly state: MatchState; readonly events: readonly GameEvent[] }
  | { readonly ok: false; readonly errors: readonly string[] };

/** Resolve the mode rules a state was created with. Throws if the preset is unknown. */
export function rulesOf(stateOrConfig: MatchState | MatchConfig): ModeRules {
  const config = 'config' in stateOrConfig ? stateOrConfig.config : stateOrConfig;
  const preset = getRulesPreset(config.rules.presetId, config.rules.presetVersion);
  if (!preset) throw new Error(`Unknown preset ${config.rules.presetId}@${config.rules.presetVersion}`);
  return preset.modes[config.mode];
}

// ---------------------------------------------------------------------------
// Legal moves
// ---------------------------------------------------------------------------

/** Legal placements for a hand against a line, honouring an opening requirement on an empty line. */
export function legalMovesForHand(
  hand: readonly TileId[],
  line: LineState,
  requirement: OpeningRequirement,
): Placement[] {
  if (line.tiles.length === 0 && requirement.kind === 'tile') {
    return hand.includes(requirement.tile) ? placementsFor(line, requirement.tile) : [];
  }
  return hand.flatMap((id) => placementsFor(line, id));
}

/** Legal placements for the seat whose turn it is (empty outside the playing phase). */
export function legalMoves(state: MatchState): Placement[] {
  if (state.phase !== 'playing') return [];
  const h = state.hand;
  return legalMovesForHand(h.hands[h.turn]!, h.line, h.requirement);
}

export type AvailableAction =
  | { readonly kind: 'play'; readonly seat: SeatIndex; readonly moves: readonly Placement[] }
  | { readonly kind: 'draw'; readonly seat: SeatIndex }
  | { readonly kind: 'pass'; readonly seat: SeatIndex }
  | { readonly kind: 'resolve-hand' }
  | { readonly kind: 'start-next-hand' }
  | { readonly kind: 'none' };

/** The single kind of action the rules allow right now. */
export function availableAction(state: MatchState): AvailableAction {
  switch (state.phase) {
    case 'hand-ended':
      return { kind: 'resolve-hand' };
    case 'hand-resolved':
      return { kind: 'start-next-hand' };
    case 'match-over':
      return { kind: 'none' };
    case 'playing': {
      const seat = state.hand.turn;
      const moves = legalMoves(state);
      if (moves.length) return { kind: 'play', seat, moves };
      if (state.hand.stockKind === 'boneyard' && state.hand.stock.length > 0 && rulesOf(state).noMove.kind === 'draw-until-playable')
        return { kind: 'draw', seat };
      return { kind: 'pass', seat };
    }
  }
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export interface PresetDeal {
  readonly hands: readonly (readonly TileId[])[];
  readonly stock: readonly TileId[];
}

function checkDeal(rules: ModeRules, d: PresetDeal): string[] {
  const errors: string[] = [];
  if (d.hands.length !== rules.seatCount) errors.push(`deal needs ${rules.seatCount} hands`);
  d.hands.forEach((h, i) => {
    if (h.length !== rules.tilesPerSeat) errors.push(`hand ${i} needs ${rules.tilesPerSeat} tiles`);
  });
  if (d.stock.length !== rules.stock.size) errors.push(`stock needs ${rules.stock.size} tiles`);
  const all = [...d.hands.flat(), ...d.stock];
  if (all.some((id) => !parseTileId(id))) errors.push('deal contains a non-canonical tile id');
  if (new Set(all).size !== all.length) errors.push('deal repeats a tile');
  if (all.length !== CANONICAL_TILE_IDS.length) errors.push('deal must use all 28 tiles');
  return errors;
}

function newHand(rules: ModeRules, number: number, d: PresetDeal, previous: { result: HandResult; opener: SeatIndex } | null): HandState {
  const opener = selectOpener(rules, d.hands, previous);
  return {
    number,
    hands: d.hands.map((h) => [...h]),
    stock: [...d.stock],
    stockKind: rules.stock.kind,
    line: EMPTY_LINE,
    opener: opener.seat,
    openingRule: opener.rule,
    requirement: opener.requirement,
    turn: opener.seat,
    consecutivePasses: 0,
    drawsThisTurn: 0,
    end: null,
    result: null,
  };
}

function handStartedEvents(h: HandState): GameEvent[] {
  return [
    {
      type: 'hand-started',
      handNumber: h.number,
      opener: h.opener,
      openingRule: h.openingRule,
      requirement: h.requirement,
      handSizes: h.hands.map((x) => x.length),
      stockCount: h.stockKind === 'boneyard' ? h.stock.length : 0,
      stockKind: h.stockKind,
    },
    { type: 'turn', seat: h.turn },
  ];
}

function buildMatch(config: MatchConfig, rules: ModeRules, rng: RngState, d: PresetDeal, scores?: readonly number[]): MatchState {
  return {
    schemaVersion: MATCH_STATE_SCHEMA_VERSION,
    engine: ENGINE_ID,
    config,
    seq: 0,
    rng,
    scores: scores ? [...scores] : rules.teams.map(() => 0),
    phase: 'playing',
    hand: newHand(rules, 1, d, null),
    history: [],
    winnerTeam: null,
  };
}

/**
 * Start a match: validate the config, shuffle with the seedable contract, deal
 * hand 1 and select its opener. `seed` must come from a secure source in
 * production and must never be shown, logged or put in a URL.
 */
export function createMatch(configInput: unknown, seed: number | string | RngState): CreateResult {
  const v = validateMatchConfig(configInput);
  if (!v.ok) return { ok: false, errors: v.errors.map((e) => `${e.path}: ${e.message}`) };
  let rng: RngState;
  try {
    rng = isRngState(seed) ? seed : seedRng(seed as number | string);
  } catch (e) {
    return { ok: false, errors: [(e as Error).message] };
  }
  const dealt = deal(v.rules, rng);
  const state = buildMatch(v.config, v.rules, dealt.rng, dealt);
  return { ok: true, state, events: handStartedEvents(state.hand) };
}

/**
 * Start a match from an explicit deal (tests, tutorials, puzzles). Later hands
 * are dealt from `seed` as usual.
 */
export function createMatchWithDeal(configInput: unknown, d: PresetDeal, seed: number | string = 0): CreateResult {
  const v = validateMatchConfig(configInput);
  if (!v.ok) return { ok: false, errors: v.errors.map((e) => `${e.path}: ${e.message}`) };
  const errors = checkDeal(v.rules, d);
  if (errors.length) return { ok: false, errors };
  const state = buildMatch(v.config, v.rules, seedRng(seed), d);
  return { ok: true, state, events: handStartedEvents(state.hand) };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

const reject = (state: MatchState, code: CommandErrorCode, message: string): ApplyResult => ({
  ok: false,
  state,
  error: { code, message },
});

function isSeat(rules: ModeRules, s: unknown): s is SeatIndex {
  return typeof s === 'number' && Number.isInteger(s) && s >= 0 && s < rules.seatCount;
}

function wellFormed(c: unknown): c is Command {
  if (typeof c !== 'object' || c === null) return false;
  const x = c as Record<string, unknown>;
  if (typeof x.seq !== 'number' || !Number.isInteger(x.seq)) return false;
  switch (x.type) {
    case 'play':
      return 'seat' in x && typeof x.tile === 'string' && typeof x.end === 'string';
    case 'draw':
    case 'pass':
      return 'seat' in x;
    case 'resolve-hand':
    case 'start-next-hand':
      return true;
    default:
      return false;
  }
}

function withHand(state: MatchState, hand: HandState, extra: Partial<MatchState> = {}): MatchState {
  return { ...state, ...extra, hand, seq: state.seq + 1 };
}

function setSeatHand(hands: readonly (readonly TileId[])[], seat: SeatIndex, next: readonly TileId[]): TileId[][] {
  return hands.map((h, i) => (i === seat ? [...next] : [...h]));
}

/** Apply one command. Never throws for bad input; never mutates `state`. */
export function applyCommand(state: MatchState, command: unknown): ApplyResult {
  if (!wellFormed(command)) return reject(state, 'malformed-command', 'Command is not well-formed');
  if (command.seq !== state.seq)
    return reject(state, 'stale-command', `Command was for seq ${command.seq}; state is at ${state.seq}`);
  if (state.phase === 'match-over') return reject(state, 'match-over', 'The match is over');
  const rules = rulesOf(state);

  switch (command.type) {
    case 'play':
    case 'draw':
    case 'pass': {
      if (state.phase !== 'playing') return reject(state, 'hand-not-in-progress', 'The hand is not in progress');
      if (!isSeat(rules, command.seat)) return reject(state, 'invalid-seat', `No seat ${String(command.seat)}`);
      if (command.seat !== state.hand.turn)
        return reject(state, 'not-your-turn', `It is seat ${state.hand.turn}'s turn, not seat ${command.seat}'s`);
      if (command.type === 'play') return play(state, rules, command);
      if (command.type === 'draw') return draw(state, rules, command.seat);
      return pass(state, rules, command.seat);
    }
    case 'resolve-hand':
      return resolveHand(state, rules);
    case 'start-next-hand':
      return startNextHand(state, rules);
  }
}

function play(state: MatchState, rules: ModeRules, c: Extract<Command, { type: 'play' }>): ApplyResult {
  const h = state.hand;
  if (!parseTileId(c.tile)) return reject(state, 'invalid-tile', `Not a canonical tile id: ${String(c.tile)}`);
  if (!(END_IDS as readonly string[]).includes(c.end)) return reject(state, 'invalid-end', `Unknown end ${String(c.end)}`);
  const hand = h.hands[c.seat]!;
  if (!hand.includes(c.tile)) {
    if (h.line.tiles.some((p) => p.tile === c.tile)) return reject(state, 'tile-already-played', `${c.tile} is already on the table`);
    return reject(state, 'tile-not-in-hand', `Seat ${c.seat} does not hold ${c.tile}`);
  }
  if (h.line.tiles.length === 0 && h.requirement.kind === 'tile' && c.tile !== h.requirement.tile)
    return reject(state, 'must-lead-required-tile', `This hand must open with ${h.requirement.tile}`);
  const options = placementsFor(h.line, c.tile);
  if (h.line.tiles.length > 0 && !options.some((p) => p.end === c.end))
    return reject(state, 'illegal-placement', `${c.tile} does not match the ${c.end} end`);

  const { line, placed } = placeTile(h.line, c.tile, c.end, c.seat);
  const remaining = hand.filter((id) => id !== c.tile);
  const hands = setSeatHand(h.hands, c.seat, remaining);
  const events: GameEvent[] = [
    { type: 'tile-played', seat: c.seat, tile: c.tile, end: line.tiles.length === 1 ? 'head' : c.end, placed, openEnds: openEnds(line)!, handSize: remaining.length },
  ];
  if (remaining.length === 0) {
    const end = { kind: 'out', seat: c.seat } as const;
    events.push({ type: 'hand-ended', end });
    return { ok: true, state: { ...withHand(state, { ...h, hands, line, consecutivePasses: 0, drawsThisTurn: 0, end }), phase: 'hand-ended' }, events };
  }
  const turn = nextSeat(rules, c.seat);
  events.push({ type: 'turn', seat: turn });
  return { ok: true, state: withHand(state, { ...h, hands, line, turn, consecutivePasses: 0, drawsThisTurn: 0 }), events };
}

function draw(state: MatchState, rules: ModeRules, seat: SeatIndex): ApplyResult {
  const h = state.hand;
  if (rules.noMove.kind !== 'draw-until-playable' || h.stockKind !== 'boneyard')
    return reject(state, 'no-draw-in-mode', `${rules.name} has no drawing`);
  if (legalMovesForHand(h.hands[seat]!, h.line, h.requirement).length > 0)
    return reject(state, 'has-legal-move', 'You hold a playable tile and must play it');
  const [tile, ...stock] = h.stock;
  if (!tile) return reject(state, 'boneyard-empty', 'The boneyard is empty; pass instead');
  const nextHand = [...h.hands[seat]!, tile];
  const playable = placementsFor(h.line, tile).length > 0;
  // Drawing never changes turn and never counts toward a block.
  const next = withHand(state, { ...h, hands: setSeatHand(h.hands, seat, nextHand), stock, drawsThisTurn: h.drawsThisTurn + 1 });
  return { ok: true, state: next, events: [{ type: 'tile-drawn', seat, tile, playable, stockCount: stock.length, handSize: nextHand.length }] };
}

function pass(state: MatchState, rules: ModeRules, seat: SeatIndex): ApplyResult {
  const h = state.hand;
  if (legalMovesForHand(h.hands[seat]!, h.line, h.requirement).length > 0)
    return reject(state, 'has-legal-move', 'You hold a playable tile and must play it');
  if (rules.noMove.kind === 'draw-until-playable' && h.stockKind === 'boneyard' && h.stock.length > 0)
    return reject(state, 'must-draw', 'You must draw from the boneyard before passing');
  const consecutivePasses = h.consecutivePasses + 1;
  const events: GameEvent[] = [{ type: 'passed', seat, consecutivePasses }];
  if (consecutivePasses >= rules.seatCount) {
    const end = { kind: 'blocked' } as const;
    events.push({ type: 'hand-ended', end });
    return { ok: true, state: { ...withHand(state, { ...h, consecutivePasses, drawsThisTurn: 0, end }), phase: 'hand-ended' }, events };
  }
  const turn = nextSeat(rules, seat);
  events.push({ type: 'turn', seat: turn });
  return { ok: true, state: withHand(state, { ...h, consecutivePasses, turn, drawsThisTurn: 0 }), events };
}

function resolveHand(state: MatchState, rules: ModeRules): ApplyResult {
  if (state.phase === 'hand-resolved' || state.hand.result)
    return reject(state, 'already-resolved', 'This hand has already been scored');
  if (state.phase !== 'hand-ended' || !state.hand.end) return reject(state, 'hand-not-ended', 'The hand has not ended');
  const h = state.hand;
  const end = h.end!;
  // Totals are collected from the frozen final hands before anything is cleared.
  const finalHands = h.hands.map((x) => [...x]);
  const score = scoreHand(rules, finalHands, end, h.opener);
  const scores = state.scores.map((s, team) => (team === score.winnerTeam ? s + score.points : s));
  const result: HandResult = {
    handNumber: h.number,
    opener: h.opener,
    end,
    finalHands,
    seatTotals: score.seatTotals,
    teamTotals: score.teamTotals,
    winnerTeam: score.winnerTeam,
    winnerSeat: score.winnerSeat,
    points: score.points,
    scoresAfter: scores,
  };
  const winnerTeam =
    score.winnerTeam !== null && scores[score.winnerTeam]! >= state.config.targetScore ? score.winnerTeam : null;
  const events: GameEvent[] = [{ type: 'hand-resolved', result, scores }];
  if (winnerTeam !== null) events.push({ type: 'match-won', team: winnerTeam, scores });
  const next = withHand(state, { ...h, result }, {
    scores,
    history: [...state.history, result],
    phase: winnerTeam !== null ? 'match-over' : 'hand-resolved',
    winnerTeam,
  });
  return { ok: true, state: next, events };
}

function startNextHand(state: MatchState, rules: ModeRules): ApplyResult {
  if (state.phase !== 'hand-resolved' || !state.hand.result)
    return reject(state, 'hand-not-resolved', 'Score the current hand before dealing the next');
  const dealt = deal(rules, state.rng);
  const hand = newHand(rules, state.hand.number + 1, dealt, { result: state.hand.result, opener: state.hand.opener });
  const next: MatchState = { ...state, seq: state.seq + 1, rng: dealt.rng, hand, phase: 'playing' };
  return { ok: true, state: next, events: handStartedEvents(hand) };
}
