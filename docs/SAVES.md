# Saves, settings, statistics and help

## Versioned local records (`src/app/storage.ts`)

Every record in `localStorage` is an envelope: `{ format, version, data }`.

| Key | Format | Version | Migrates from |
| --- | --- | --- | --- |
| `sticks-and-bones.save` | `sticks-and-bones/match` | 2 | the Stage 5 un-enveloped save (`sticks-and-bones-save@1`) |
| `sticks-and-bones.settings` | `sticks-and-bones/settings` | 3 | v2 (adds the Story text size and instant text; an existing Story text size is carried over from the Story record) and the Stage 6/7 un-enveloped settings object |
| `sticks-and-bones.stats` | `sticks-and-bones/stats` | 1 | — |
| `sticks-and-bones.achievements` | `sticks-and-bones/achievements` | 1 | v0 (`{ unlocked: [ids] }`, never shipped: accepted so the path is tested). Counters, unlocks, dedupe keys, the Story case log. No tile ids or hands (`docs/ACHIEVEMENTS.md`) |

**Reading never throws.**

- **missing:** defaults are used.
- **older version:** migrated, then rewritten in the current version.
- **damaged:** unreadable JSON, wrong shape, or failed validation (for example a
  duplicated tile or an illegal state) → **corrupt**.
- **newer than this build, or an unknown rules preset** → **incompatible**.

Corrupt or incompatible data is moved to `<key>.quarantine`, not silently
destroyed, and the menu shows a notice ("Your saved game couldn't be read…",
"…came from a different version…"). If storage is blocked entirely, the menu
says games and settings last only until the page closes.

### When a write is refused: per-record health (`src/app/write-health.ts`, hardening pass)

Every write is checked and reported **per record**. This covers the match save (including a match's first
save), settings, statistics, Story progress and achievements.
- **Alert:** a failure shows the persistent "Not saved" alert naming the records that are failing, e.g. "Not
  saved: your Story progress".
- **One record never hides another:** the alert used to be a single flag, so a later successful match save
  hid a failed Story write. Now a record clears only when that record is written, and the alert closes only
  when no record is failing.
- **Retries write the latest in-memory value** of their record, never an older one. They run:
  - on the alert's **Try again**;
  - when any other record is written successfully;
  - before an update;
  - when the page is hidden or closed.
- **Records removed on purpose** (a discarded or replaced match save) drop their pending retry, so an old save
  can't come back.
- **Layout:** while the alert is up, the story stage and the table reserve its height, so it never covers
  Continue, the hand or the table's controls.
- **Update-time choices are unchanged.** An update first writes the stable place and retries anything else
  pending. If the place still isn't stored (including a Story record that is still failing), the player
  chooses "Not now — keep playing" or "Update anyway", and is never told it saved. Progression stays
  once-only: a retry rewrites the same progress (completion included), never a new completion.
- **Tests:** `src/app/write-health.test.ts`. `npm run faults` § F refuses only the Story record: another
  record's success doesn't hide it, and once storage recovers, Try again stores the latest line and clears
  the alert.

## Match saves (`src/app/save.ts`)

**A save holds:**

- the full **deterministic engine state**, whose config carries the **rules preset
  id and version** (duplicated in the envelope for a quick compatibility check);
- the AI's own RNG streams;
- the setup (opponent kind, difficulty);
- a **match id**.

**It holds no presentation state.** No animation, effect, timer, cover step or AI
request is saved, so a restore can't resume a half-finished animation.

**Restore** (`resume()` in `src/main.ts`) builds a fresh session from the engine
state. What happens next is re-derived:

- **AI turn:** the AI asks again, once. Any decision still in flight from before
  the reload belongs to a disposed session and is discarded.
- **Hand ended, not yet scored:** the hand is scored exactly once.
- **Hand already scored** (results sheet): restore keeps the score, and Next hand
  continues.
- **Two humans:** always covered until the right player reveals.

**Autosave** runs after every engine change. A finished match removes its save.
Developer both-seats matches are never saved.

**Actions in every state:**

| | Human turn | AI thinking | Results | Handoff cover |
| --- | --- | --- | --- | --- |
| Resume (after refresh) | identical state | identical state, AI asks once | sheet shown, no re-score | cover again |
| Next hand | — | — | ✓ | — |
| Restart / rematch | pause sheet → confirm | pause sheet → confirm (pending move cancelled) | Rematch | — |
| Return to menu | pause sheet (save kept) | pause sheet (save kept) | Menu | **Save & leave to menu** on the cover |
| Reset (teardown) | cancels AI, timers, effects, sounds | same | same | same |

The studio video sits before any match exists. Its Skip, timeouts and reload
behaviour are covered in `docs/AUDIO.md`.

## Statistics (`src/app/stats.ts`)

Kept on this device only: no accounts, achievements or unlocks.

- **Against the computer:** wins and losses by mode × difficulty (Partnership
  results are your team's).
- **Two players:** completed matches by mode, plus a win–loss record for the two
  humans as partners against the computers.
- **Abandoned:** a match started and then discarded, restarted, or replaced by a
  new game before its end. **Abandoned is never a loss.** Leaving to the menu
  keeps the save, so it isn't abandoned.
- Each match id is recorded **once**, so a reload around the end of a match can't
  double count.
- A Reset button with a two-tap confirmation clears everything.

## Help screen (`src/ui/help.ts`)

The help screen was written from `docs/RULES.md` and covers:

- the tiles;
- your turn (match an end, doubles crosswise, never spinners, must play);
- **drawing and passing**;
- **turn direction** (counterclockwise, with a seat diagram);
- **opening** (first and later hands);
- **ending and blocked scoring**, ties and targets;
- **bonuses not used** (no capicú, chuchazo, forced-pass bonus or forced redeal);
- how to play on this device.

`src/ui/help.test.ts` cross-checks the wording against `RULES.md` and the
presets. Each mode's detailed card is generated from preset data.

## Results arithmetic (`src/app/explain.ts`)

The results sheet shows each hand's pip sum, for example
`5|5 (10) + 4|4 (8) + 2|0 (2) = 20`. A double blank shows as `0|0 (0)` and an
empty hand as `no tiles left = 0`. Below that, a "How the points add up" block
gives:

- the team sums (Partnership);
- the decision ("went out first" / "Blocked: You 4 vs Cousin 13 — fewer pips wins" /
  "Blocked and tied");
- the points rule with its arithmetic (`Every pip left: 4 + 13 = 17`,
  `Opponent's pips minus own: 13 − 4 = 9`).

A property test checks that the final number equals the engine's `points` on
more than 150 simulated hands across all modes.
