# Computer players (AI)

Three difficulties, all **fair**. Each one decides from a sanitized
`AiObservation` only, and submits its choice through the same validated
`applyCommand` path that human input uses.

## What the AI can see

`buildObservation(seatView, rules)` (`src/ai/observation.ts`) contains:

- its own hand, and the legal moves the engine computed for it;
- the public chain (tiles, orientation, who played each) and both open ends;
- this hand's **public action log**: plays, passes with the open ends at the
  time, and *who* drew (never *what*);
- tile counts (every hand size, the boneyard count, the count of set-aside tiles);
- mode and team information (seat count, teams, partner), the public preset
  rules, the opening rule and requirement as that seat may see them, scores and
  target.

It never contains other hands, undealt or set-aside tiles, boneyard order, the
shuffle seed or the engine's RNG state. The object is a structured copy and is
deep-frozen. ESLint forbids AI policy files from importing the match, view, deal,
serialization or app modules.

Tests check that:

- observations carry exactly the whitelisted keys and no hidden tile id or RNG state;
- **reshuffling every hidden tile** (other hands and stock) gives the same
  observation and the same decision at every difficulty;
- the inference is **sound**: the real hidden hands always satisfy the inferred
  constraints.

## Randomness

Each AI seat has its own RNG stream, seeded from a separate AI seed
(`ai:<aiSeed>:<seat>`). It is never derived from or shared with the shuffle RNG.
Changing the AI seed changes the AI's choices and never the deal. Decisions are
deterministic given the observation and the AI's RNG state.

## Difficulties (honest descriptions)

| Level | Method | Cost |
| --- | --- | --- |
| **Easy** (`easy.ts`) | Weighted random choice among legal moves (slight preference for heavy tiles and doubles); one move in five is uniform. No lookahead. | negligible |
| **Normal** (`normal.ts`) | One-ply heuristic, no search. Scores each move on pip disposal, doubles, suit coverage of the hand it leaves, opponents' voids proven by public passes, partner support in Partnership (penalise ends the partner passed on, favour suits the partner has played), heavier blocking weight when an opponent is down to 2 tiles, and a pip-count estimate when a move would lock the game. | < 1 ms |
| **Hard** (`hard.ts`) | Determinized Monte Carlo (perfect-information Monte Carlo). Samples 64 worlds of the unknown tiles consistent with public evidence (hand sizes, stock size, pass voids, and the "highest double opens" exclusions), plays each legal move out to the end of the hand in every world with a cheap greedy rollout for all seats, and picks the best average result for its side. Ties fall back to Normal. It searches over sampled guesses; it is not an exact solver. | ~1–2 ms mean, ≤ ~35 ms worst (measured inline in Node) |

Forced situations (draw, pass, a single legal move) are played instantly at every
level.

### Inference used (from public evidence only)

- **Pass ⇒ void.** A seat may pass only with no legal move and, in Draw, an empty
  boneyard, and its hand never grows afterwards. So it holds neither open pip,
  permanently.
- **Opening exclusion.** Under "highest double, else heaviest tile", every tile
  stronger than the one led was in no dealt hand. A seat that hasn't drawn since
  can't hold it.
- **Not used:** draws. A draw shows the seat lacked the open pips *before*
  drawing, but which tiles it held then can't be separated from what it drew.
  Leaving out sound-but-unusable evidence keeps the sampler correct.

The sampler (`sampler.ts`) assigns the most-constrained tiles first, choosing
holders in proportion to remaining capacity. It is approximately, not exactly,
uniform over consistent worlds. If 40 attempts fail it drops the constraints for
that world (tests require this to happen in under 2% of worlds; in practice it is 0%).

## Strength (mirrored duels, fixed seeds)

`npm run ai:tournament` plays every deal twice with the sides swapped and reports
the first side's mean points per hand (20 deals × 4 hands × 2 seatings, 2026‑11‑16):

| Mode | Normal vs Easy | Hard vs Normal | Hard vs Easy |
| --- | ---: | ---: | ---: |
| Draw | +2.94 | +10.14 | +15.16 |
| Block | +3.29 | +0.84 | +3.60 |
| Partnership | +13.50 | +1.74 | +20.18 |

Block has the smallest edges because half the set is never in play and hands are
short. The unit tests assert the ordering Normal > Easy and Hard > Normal in every
mode on a smaller fixed-seed sample. They also assert that the levels choose
different moves on a meaningful share of real positions (Easy vs Normal > 25%,
Normal vs Hard > 10%).

## Runtime safety (`src/app/session.ts`)

- Decisions are computed in a **Web Worker** (`src/ai/worker.ts`). The inline
  runner is used in tests, and also if the worker fails. E2E observes no
  main-thread long tasks during AI play.
- Every request carries a token `{epoch, seq, seat}`. **Reset/exit** (dispose),
  **pause** (an open confirmation dialog or a hidden tab), **load** and **hand
  completion** bump the epoch or advance `seq`. A decision that arrives late is
  discarded and counted in `stats.staleDiscarded`, so it can't place a ghost tile
  or move twice.
- Thinking delays (Easy 650 ms, Normal 800 ms, Hard 950 ms, forced 380 ms) are
  presentation only. A move is applied when *both* the decision and the delay are
  done, and only if the token is still valid.
