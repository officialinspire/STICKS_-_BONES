/**
 * Bounded, seeded full-match simulation with a random legal-move policy.
 * Used by tests (and later for AI evaluation). Pure: two RNG seeds in, final
 * state out. Throws SimulationError carrying both seeds so failures replay.
 */
import type { Command } from './commands';
import { checkInvariants } from './invariants';
import { applyCommand, availableAction, createMatch } from './match';
import { randomInt, seedRng, type RngState } from './rng';
import type { MatchState } from './state';

export class SimulationError extends Error {
  constructor(
    message: string,
    readonly dealSeed: number | string,
    readonly policySeed: number | string,
    readonly state: MatchState | null,
  ) {
    super(`${message} [dealSeed=${JSON.stringify(dealSeed)} policySeed=${JSON.stringify(policySeed)}]`);
  }
}

export interface SimulationOptions {
  readonly config: unknown;
  readonly dealSeed: number | string;
  readonly policySeed: number | string;
  /** Hard cap on accepted commands for the whole match. */
  readonly maxCommands?: number;
  /** Hard cap on commands within a single hand. */
  readonly maxCommandsPerHand?: number;
  /** Run checkInvariants after every command (default true). */
  readonly checkEveryStep?: boolean;
  /** Stop early after this many accepted commands (for save/restore tests). */
  readonly stopAfter?: number;
  /** Start from an existing state instead of creating a match. */
  readonly from?: { readonly state: MatchState; readonly policy: RngState };
}

export interface SimulationResult {
  readonly state: MatchState;
  readonly policy: RngState;
  readonly commands: number;
  readonly hands: number;
}

/** Choose the next command for whoever must act, uniformly among legal options. */
export function randomCommand(state: MatchState, policy: RngState): { command: Command | null; policy: RngState } {
  const a = availableAction(state);
  switch (a.kind) {
    case 'play': {
      const r = randomInt(policy, a.moves.length);
      const m = a.moves[r.value]!;
      return { command: { type: 'play', seq: state.seq, seat: a.seat, tile: m.tile, end: m.end }, policy: r.state };
    }
    case 'draw':
    case 'pass':
      return { command: { type: a.kind, seq: state.seq, seat: a.seat }, policy };
    case 'resolve-hand':
    case 'start-next-hand':
      return { command: { type: a.kind, seq: state.seq }, policy };
    case 'none':
      return { command: null, policy };
  }
}

export function simulateMatch(opts: SimulationOptions): SimulationResult {
  const maxCommands = opts.maxCommands ?? 20_000;
  const maxPerHand = opts.maxCommandsPerHand ?? 400;
  const check = opts.checkEveryStep ?? true;
  let state: MatchState;
  let policy: RngState;
  if (opts.from) {
    state = opts.from.state;
    policy = opts.from.policy;
  } else {
    const created = createMatch(opts.config, opts.dealSeed);
    if (!created.ok) throw new SimulationError(`createMatch failed: ${created.errors.join('; ')}`, opts.dealSeed, opts.policySeed, null);
    state = created.state;
    policy = seedRng(opts.policySeed);
  }
  function fail(msg: string): never {
    throw new SimulationError(msg, opts.dealSeed, opts.policySeed, state);
  }
  let commands = 0;
  let handCommands = 0;
  let handNumber = state.hand.number;
  for (;;) {
    if (opts.stopAfter !== undefined && commands >= opts.stopAfter) break;
    const pick = randomCommand(state, policy);
    policy = pick.policy;
    if (!pick.command) break;
    const r = applyCommand(state, pick.command);
    if (!r.ok) fail(`legal command rejected: ${r.error.code} ${r.error.message} (${JSON.stringify(pick.command)})`);
    if (r.state.seq !== state.seq + 1) fail('seq did not advance by one');
    if (r.events.length === 0) fail('accepted command produced no events');
    state = r.state;
    commands++;
    if (state.hand.number !== handNumber) {
      handNumber = state.hand.number;
      handCommands = 0;
    }
    handCommands++;
    if (check) {
      const problems = checkInvariants(state);
      if (problems.length) fail(`invariant broken after ${JSON.stringify(pick.command)}: ${problems.join('; ')}`);
    }
    if (handCommands > maxPerHand) fail(`hand ${handNumber} exceeded ${maxPerHand} commands`);
    if (commands > maxCommands) fail(`match exceeded ${maxCommands} commands`);
  }
  return { state, policy, commands, hands: state.history.length };
}
