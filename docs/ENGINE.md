# Rules engine

`src/engine/` is a pure TypeScript state machine that implements
[RULES.md](RULES.md) by reading the versioned preset data in
`rules/presets.ts`. It never touches the DOM, timers, audio, storage or ambient
randomness (ESLint enforces this), and every value it holds is plain JSON.

## Flow

```
createMatch(config, seed) ─► MatchState (phase: playing) + events
        │
        ▼  applyCommand(state, command) → { ok, state, events } | { ok:false, state (unchanged), error }
playing ──play/draw/pass──► playing
   │  out (hand emptied) or block (seatCount passes in a row)
   ▼
hand-ended ──resolve-hand──► hand-resolved ──start-next-hand──► playing (next hand)
                    └── a side reaches the target ──► match-over (terminal)
```

- **Commands** (`commands.ts`): `play {seat, tile, end}`, `draw {seat}`,
  `pass {seat}`, `resolve-hand`, `start-next-hand`. Every command echoes
  `state.seq`, and a mismatch is rejected as `stale-command`. That covers double
  taps, late AI moves and replays.
- **Rejections** come back as typed codes and leave the state unchanged:
  wrong seat/turn, invalid tile, `tile-already-played` (reuse),
  `tile-not-in-hand`, `illegal-placement`, `must-lead-required-tile`,
  `has-legal-move` (premature draw/pass), `must-draw`, `no-draw-in-mode`,
  `boneyard-empty`, `hand-not-in-progress` (finished round),
  `hand-not-ended`, `already-resolved`, `hand-not-resolved`, `match-over`,
  `malformed-command`.
- **`availableAction(state)`** reports the single kind of action the rules
  allow right now (play with its legal moves, draw, pass, resolve, next hand, none).
- **Events** (`events.ts`) describe what happened, for presentation only.
  Presentation can't send events back into the rules. `redactEventsForSeat`
  hides other seats' drawn tiles and the opener's required tile.

## Line model

`line.ts` keeps the layout as a logical chain, head → tail, with no screen
coordinates. Each `PlacedTile` stores the canonical `tile` id plus `headPip`
/ `tailPip` (which side faces which end), `crosswise` (doubles) and
`playIndex`. Flipping a tile only changes which pip faces which end; the id is
never rewritten. `openEnds` always returns exactly two ends (doubles are never
spinners). `placementsFor` returns one placement per matching end, so a tile
that fits both ends gives two distinct choices, even when both ends show the
same pip. On an empty line either end is accepted and recorded as `head`.

## Rule details as implemented

- **Opener** (`opening.ts`): `selectOpener` follows the preset's
  `firstHand` / `afterOut` / `afterBlockWin` / `afterBlockTie` rule. The
  partnership tie-break walks turn order from the previous hand's opener.
- **Draw**: one tile per `draw` command, taken from the front of the boneyard.
  The turn doesn't advance. Drawing is only allowed with no legal move, and
  passing only once the boneyard is empty. A playable drawn tile must be played
  that turn. Draws never touch the pass counter, so they can't trigger a block.
- **Block**: detected when every seat passes in a row
  (`consecutivePasses === seatCount`). Any play resets the counter to 0.
- **Out**: a play that empties a hand ends it immediately.
- **Resolution** (`scoring.ts`): `resolve-hand` copies the final hands, computes
  seat and team totals, then scores per the preset. This happens exactly once:
  the result is stored on the hand and in `history`, and a second resolve is
  rejected. Hands are only replaced when `start-next-hand` deals.
- **Target**: the match ends as soon as the scoring side reaches
  `config.targetScore` (≥). Only one side scores per hand, so there's never a
  simultaneous finish.

## Public action log

`HandState.log` (state schema **v2**) records every play, every pass (with the open
ends at the time) and every draw (**who** drew, never which tile). `seatView`
exposes it as `log`. It is the AI's turn history and drives the seat badges
("passed", "drew"). Invariants check that it agrees with the line and the pass
counter, and that it never names a drawn tile. Saves from schema v1 are rejected
on restore; none were ever persisted.

## Hidden information

`MatchState` contains every hand, the stock and the RNG state, so treat it as
**secret**. Seats, AI and UI should read `seatView(state, seat)`. A seat view
shows its own hand, counts for everything else, public line/scores/history,
legal moves only on its turn, and hides the opener's required tile from other
seats until it's played. Saves (`serializeMatch`) contain secrets: store them
locally and never put them in URLs or logs.

## Persistence and safety nets

- `serializeMatch` / `restoreMatch`: JSON round trip. Restore re-runs every invariant.
- `checkInvariants`: tile conservation across hands, stock and line;
  chain/orientation validity; phase/end/result consistency; pass-counter range;
  dealt-size limits in no-draw modes; score/history consistency; target state.
- `simulateMatch` / `randomCommand`: bounded, seeded random-legal-policy
  matches (caps on commands per match and per hand). `SimulationError` carries
  `dealSeed` and `policySeed` so a failure can be replayed exactly.
- `testing/craft.ts` (tests only): builds a specific, invariant-checked
  mid-hand state, plus `chain()` to arrange tiles into a valid line.
