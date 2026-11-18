# Analytics: disabled adapter, pending the owner's contract

## Status: DISABLED, nothing is sent

The repository doesn't contain any of the following for this game, so none were
invented:

- an INSPIRE analytics implementation or configuration;
- keys or project/measurement IDs;
- a consent mechanism;
- a deployed event list;
- a website-attribution or launch-ID contract.

`src/app/analytics-config.ts` ships with `enabled: false`, `transport: null` and
`consent: () => false`.

### Possible source (not inspected)

A code search of the owner's GitHub account found an INSPIRE analytics
implementation in **`officialinspire/SPIRITBALL`**:

- `js/analytics.js`;
- `qa/analytics-safety.mjs`;
- `qa/analytics-browser.mjs`;
- `.github/workflows/analytics-qa.yml`.

This session could not open that repository: access was outside its permitted
scope and the request to attach it was refused. Its contract, consent behaviour
and keys were therefore **not inspected and not copied**. If that is the INSPIRE
standard, it is the natural source for the inputs below.

**Re-checked in the integration stage (2026-11-17):** a fresh search again found
`SPIRITBALL/js/analytics.js` and also **`SPIRITBALL/js/attribution.js`**. Attaching
the repository read-only was refused again by this session's permission policy,
so it is still uninspected; nothing was inferred from file names. **The exact
missing input** is either (a) the owner's permission for a session to read
`officialinspire/SPIRITBALL` (`js/analytics.js`, `js/attribution.js`,
`qa/analytics-safety.mjs`), confirming that it is the INSPIRE contract to follow,
or (b) the five inputs below supplied directly.

## Inputs the owner must supply to turn it on

1. **Service and client contract:** endpoint or SDK, and the key / project /
   measurement ID meant for **STICKS & BONES**, not another game's.
2. **Consent behaviour:** the INSPIRE consent signal or API, its default state and
   any regional rules. Until then, consent is treated as **not granted**.
3. **Event mapping:** the deployed event names and fields this game should map to,
   or approval of the proposed names below.
4. **Website → game attribution** (only if a contract exists):
   - the allowlisted promotional query parameters;
   - the launch-ID format and how the website passes it.

   Nothing reads query parameters today, and none of this ever affects rules,
   seeds or gameplay.
5. **Verification tooling:** the service's own debug or test view (for example
   a debug mode or test property). Live verification is **pending** until then.

### How to enable once the inputs exist

1. Implement `AnalyticsTransport.send()` for the service.
2. Wire `consent` to the real signal and set `enabled: true`.
3. Map the event names if needed.
4. Check the events in the service's test tooling.
5. Record the result in `docs/BUILD_STATUS.md`.

## Proposed events (minimal, sanitized, not yet deployed anywhere)

Every payload is **rebuilt from a per-event allowlist** of enum, integer and
boolean fields (`sanitizeEvent`). Unknown fields are dropped and invalid values
reject the event. The app adds `app: 'sticks-and-bones'` when sending.

| Event | When | Fields |
| --- | --- | --- |
| `game_launch` | Once per page load | `display` (`browser`/`standalone`), `build` |
| `match_start` | **Actual start**: the first accepted move (play, draw or pass) of a **new** match | `start_kind` (`fresh` / `rematch` / `restart`), `mode`, `opponent` (`ai`/`local`), `difficulty` (vs computer; else null), `humans_partnered` (two humans; else null) |
| `match_resume` | The player taps Resume, including after an update reload. **Never** counted as a start. | `mode`, `opponent`, `difficulty`, `hand_number` |
| `round_end` | Each resolved hand, once per match + hand | `mode`, `opponent`, `difficulty`, `hand_number`, `ending` (`domino`/`blocked`/`blocked_tie`), `winner` (`player`/`computer` or `team_1`/`team_2`/`tie`), `points` |
| `match_end` | Once per match | `mode`, `opponent`, `difficulty`, `hands_played`, `winner` |
| `app_error` | Uncaught error or unhandled rejection; each distinct message at most 3× per page | `kind`, `area` (`boot`/`menu`/`table`), `message` (sanitized, ≤ 120 chars) |

**Never sent:**
- tile hands, the board line or move history;
- game or AI seeds, RNG state;
- player-entered names (winners are `player`, `computer` or `team_1`/`team_2`);
- raw saves or settings;
- any image, including Roberto's reference sheets;
- URLs, paths or free text, except the sanitized error message.

**Error sanitizing** replaces the following with tokens: emails, URLs and query
strings, file paths, quoted text, tile ids and values (`t64`, `6|4`), and numbers
of two or more digits.

**De-duplication:**
- **Re-renders** never emit anything: events come only from applied engine
  events.
- **Restored games** report `match_resume`, never `match_start`.
- **Double taps** on "Deal the tiles" or Resume start one match.
- **A dealt match that never got a move** doesn't count.
- **Rematch and restart** are new matches labelled `rematch` or `restart`.

## Story events (proposed; separate from Quick Play)

A story hand never emits `match_*` or `round_*`. Story events carry only fixed enums: the nine scene ids,
the hand mode, outcome, part and route. They never carry hands, seeds, raw saves, entered names or dialogue
(the story has no dialogue choices). These names are this build's **proposal**, to be mapped to the owner's
contract; with the adapter disabled, nothing is sent.

| Event | When (de-duplicated) | Fields |
| --- | --- | --- |
| `story_encounter_start` | The chapter hand's **first accepted command** (the opponent's included), once per dealt hand; never on the deal render or a restored hand | `scene`, `mode`, `replay` |
| `story_chapter_complete` | The hand resolves (Prologue/Epilogue: the end card), once per case + chapter (a replay counts once per replay run) | `scene`, `outcome` (`win`/`loss`/`tie`/`none`), `replay` |
| `story_case_complete` | The Epilogue's end card, once per case (never on replay) | — |
| `story_resume` | Continue Case into an in-progress line or hand, or the automatic return after an update; once per position | `scene`, `part` (`dialogue`/`hand`), `via` (`continue`/`update`) |
| `story_assist` | The player uses **Skip** (to the next decision point), once per case + scene part | `scene`, `kind` (`skip_scene`) |

"Finish Hand with AI assistance" does not exist yet, so it has no event. Consent behaviour is unchanged:
nothing is sent without `enabled`, a transport **and** granted consent, which matches the only integration
that exists (none). Evidence: `src/app/analytics.test.ts` (allowlist, dedupe, separation, consent) and
`npm run story:e2e` § H (real hand: one encounter on the first move, refresh mid-hand → one resume and no
second start, one completion, no Quick Play events, enum-only fields).

## Evidence

- `src/app/analytics.test.ts` (8 tests):
  - ships disabled and sends nothing; consent gate;
  - fresh vs resume labelling; no double starts (re-render, double tap,
    restored game); rematch label;
  - once-only round and match ends;
  - allowlist rejects seeds, hands, names and saves;
  - message sanitizing; error cap; a throwing transport or consent hook can't
    break the game.
- `npm run matches` played complete matches in all 8 arrangements. The dev-only
  recorder (`window.__sbAnalytics`, absent from production builds) showed for
  each:
  - one `match_start` (`fresh`);
  - one `round_end` per hand and one `match_end`;
  - `rematch` correctly labelled;
  - a mid-match reload → Resume labelled `match_resume` with no new start;
  - a double-tapped Deal → one start;
  - no secrets in any payload.
- **Live verification in the real service: PENDING.** No service or test
  tooling is configured.
