# Achievements

100 achievements, each earned through mechanics that already exist: the frozen rules presets, Quick Play
against the computer, two players on one device, the approved Story, and existing screens and controls.
No rule, currency, timer or calendar streak was added.

## Architecture

| Piece | File | Role |
| --- | --- | --- |
| Catalog | `src/app/achievements/catalog.ts` | Data only. Each entry has: stable id, title, description, category, condition (counter + target, or `all` of several counters), plain-language "how", badge (glyph + tier) and spoiler flag. |
| Facts | `src/app/achievements/facts.ts` | Pure functions from **applied, redacted** events to counter increments (`HandObserver`, `MatchObserver`, `localMatchFacts`). No DOM, storage or clock. |
| Progress | `src/app/achievements/progress.ts` | Versioned record `sticks-and-bones.achievements` (v1, `src/app/storage.ts` envelope, migration from v0, quarantine on corruption). Dedupe keys, unlocks, Story case log, retroactive awards. |
| Tracker | `src/app/achievements/tracker.ts` | Turns table events, Story completions and screen/control uses into facts. It saves through `writeRecord`; a refused save shows the app's persistent **Not saved** banner. |
| Screen, badges, notices | `src/ui/achievements.ts` + `achievements.css` | A lazy chunk (with its own stylesheet), loaded after the menu is up. |
| Bridge | `src/ui/achievements-bridge.ts` | Core side. It subscribes to the **TableController** synchronously and buffers events until the chunk has loaded, so nothing is missed and the game never waits. |

### Where events come from
- **Tables:** `TableController.subscribe`, the approved boundary. These events have already been applied
  by the engine and redacted for the revealed seat. The tracker never reads the session's raw events, a
  hidden hand, the stock or the RNG.
- **Public information used:** plays, draws and passes by seat (the tile only for the player's own
  draws), hand sizes, open ends, scores, and the hands revealed on the results sheet.
- **Story:** the existing `track.chapterComplete` / `track.assist` hooks. Completion is written once per
  case and scene by the Story player.
- **Exploration:**
  - How to Play and Statistics opened from the menu.
  - A setting changed.
  - Sort or zoom used at the table.
  - The Story text size or instant text changed in Settings.

### What counts

| Table | Counts |
| --- | --- |
| Quick Play against the computer | Everything: live counters, hand and tactical facts, match facts. |
| Story, first play of a chapter | Hand and tactical facts (no match facts: a chapter is one hand), plus Story facts. |
| Story **replay** | Nothing. |
| Two players on one device | Only finished shared matches (`ex-local`, `ex-local-all`, `p4-local-partners`). Two people share the device, so per-hand play can't be credited to one of them. |
| Developer fixtures / both-seats mode | Nothing. |
| **Assisted:** Skip scene in Story | That case can't earn **Every Word** (`story-no-skip`); everything else still counts. |
| **Assisted:** Finish hand with AI in Story | From the assistant's first move on, that table counts nothing (no hand, tactical or win facts); the chapter still completes (`story.<scene>`), but its result never counts as a win (`story-wins-3`, `story-wins-7`). Counted once (keyed), never in replays. Turning the table tips off by itself counts no exploration. |

### Never counted twice
- **Hand results:** keyed by `<game>:h<hand number>`.
- **Matches:** keyed by `<game>:match`.
- **Story chapters:** keyed by `story:<case start>:<scene>`.
- **Screen and control uses:** keyed by `note:<counter>`.
- **Live counters** (tiles, doubles, draws, passes) come from events the engine emits once per accepted
  command; a restored game never re-emits them.

### Partial observation
- **Hand resumed after a reload:** its result still counts, but anything that needs the whole hand (never
  drew, forced passes, capicúa, …) is only awarded for hands observed from the deal.
- **Comebacks:** need the whole match in one sitting.
- **Seven for Seven and Every Word:** need the case tracked from its prologue.

### Retroactive awards
- **Applied once, from records that prove them:**
  - Quick Play statistics: wins by mode and difficulty, matches finished, two-player completions,
    two-player partners' wins.
  - Story progress: completed scenes.
- **Applied as max, never added.** They're marked "from earlier records", and one quiet summary notice
  is shown.
- **Not claimed:** no hand-level achievement, because no record holds hand detail.

### Notices
- Quiet `role="status"` toasts with `pointer-events: none`, under the privacy cover and sheets.
- **They wait while:**
  - a hand is covered for a private handoff;
  - a Story scene's dialogue is on screen;
  - a sheet or dialog is open;
  - the start screen is up;
  - the page is hidden.
- Reduced motion: no animation.
- A spoiler achievement's title appears only once earned. Until then the page shows "Hidden story
  achievement" and a lock badge.

### Badges
Inline SVG medallions (`role="img"`, label "*Title* badge, unlocked/locked").
- **Colour:** the disc takes its category colour from the design tokens.
- **Glyph:** 14 glyphs, drawn in `currentColor`.
- **Tier:** 1–3 dots.
- **Locked:** a dashed outline in ink-soft. It's never colour alone: the card also says Locked or shows
  progress.

## The 100 achievements

**Retired id:** `ex-transcript` ("On the Record", open a Story transcript) was retired when the transcript control was removed from dialogue. It is never reissued. `ex-story-text` replaces it, so the catalog stays at 100. A record that still holds the old unlock drops it on load (unknown ids are never kept).

### Learning (10)

| ID | Title | How to earn | Target | Spoiler |
| --- | --- | --- | ---: | --- |
| `learn-first-tile` | First Bone Down | Play a tile in any hand against the computer or in Story. | 1 |  |
| `learn-first-draw` | From the Boneyard | Draw a tile from the boneyard in a Draw hand. | 1 |  |
| `learn-first-pass` | Knock Knock | Pass when you have no playable tile (Block, Partnership, or Draw with an empty boneyard). | 1 |  |
| `learn-both-ends` | Either Way | Play a tile that fits both open ends. | 1 |  |
| `learn-open` | Opening Move | Play the first tile of a hand. | 1 |  |
| `learn-double` | Crosswise | Play any double. | 1 |  |
| `learn-hand` | Hand Played | Finish a hand (any result). | 1 |  |
| `learn-hand-won` | On the Board | Win a hand. | 1 |  |
| `learn-match` | Full Match | Finish a Quick Play match against the computer. | 1 |  |
| `learn-match-won` | Table Captain | Win a Quick Play match against the computer. | 1 |  |

### Draw (14)

| ID | Title | How to earn | Target | Spoiler |
| --- | --- | --- | ---: | --- |
| `draw-win-easy` | Draw: Easy Win | Win a Draw match against the computer on Easy. | 1 |  |
| `draw-win-normal` | Draw: Normal Win | Win a Draw match against the computer on Normal. | 1 |  |
| `draw-win-hard` | Draw: Hard Win | Win a Draw match against the computer on Hard. | 1 |  |
| `draw-domino` | Dominó! | Play your last tile to win a Draw hand. | 1 |  |
| `draw-no-draw` | Never Touched the Pile | Win a Draw hand in which you never drew a tile. | 1 |  |
| `draw-deep-dig` | Deep Dig | Draw at least 5 tiles in one Draw hand and win that hand. | 1 |  |
| `draw-last-tile` | Last One in the Yard | Draw the last tile left in the boneyard. | 1 |  |
| `draw-dry-win` | Dry Yard | Win a Draw hand after the boneyard was emptied during it. | 1 |  |
| `draw-fifty` | Fifty in One | Win a Draw hand worth at least 50 points. | 1 |  |
| `draw-tranque` | Draw Tranque | Win a Draw hand that ends blocked (lower pip count). | 1 |  |
| `draw-200` | Long Game: Draw | Win a Draw match against the computer with the target set to 200. | 1 |  |
| `draw-shutout` | Shutout: Draw | Win a Draw match in which the computer scores 0. | 1 |  |
| `draw-comeback` | Comeback: Draw | Win a Draw match after trailing by 40 or more points (whole match played in one sitting). | 1 |  |
| `draw-ten-hands` | Draw Regular | Win 10 Draw hands in total. | 10 |  |

### Block (12)

| ID | Title | How to earn | Target | Spoiler |
| --- | --- | --- | ---: | --- |
| `block-win-easy` | Block: Easy Win | Win a Block match against the computer on Easy. | 1 |  |
| `block-win-normal` | Block: Normal Win | Win a Block match against the computer on Normal. | 1 |  |
| `block-win-hard` | Block: Hard Win | Win a Block match against the computer on Hard. | 1 |  |
| `block-domino` | Out Clean | Play your last tile to win a Block hand. | 1 |  |
| `block-tranque` | ¡Tranque! | Win a Block hand that ends blocked (lower pip count). | 1 |  |
| `block-no-pass` | No Knocks | Win a Block hand in which you never passed. | 1 |  |
| `block-forced3` | Squeeze Play | In one Block hand, make your opponent pass 3 times right after your play. | 1 |  |
| `block-forty` | Forty in One | Win a Block hand worth at least 40 points. | 1 |  |
| `block-200` | Long Game: Block | Win a Block match against the computer with the target set to 200. | 1 |  |
| `block-shutout` | Shutout: Block | Win a Block match in which the computer scores 0. | 1 |  |
| `block-comeback` | Comeback: Block | Win a Block match after trailing by 40 or more points (whole match played in one sitting). | 1 |  |
| `block-ten-hands` | Block Regular | Win 10 Block hands in total. | 10 |  |

### Partnership (14)

| ID | Title | How to earn | Target | Spoiler |
| --- | --- | --- | ---: | --- |
| `p4-win-easy` | Partners: Easy Win | Win a Partnership match (you and Luz against the computers) on Easy. | 1 |  |
| `p4-win-normal` | Partners: Normal Win | Win a Partnership match (you and Luz against the computers) on Normal. | 1 |  |
| `p4-win-hard` | Partners: Hard Win | Win a Partnership match (you and Luz against the computers) on Hard. | 1 |  |
| `p4-self-out` | Carried the Team | Play your last tile first in a Partnership hand. | 1 |  |
| `p4-partner-out` | Set Up the Finish | Win a Partnership hand when your partner plays out first. | 1 |  |
| `p4-tranque` | Team Tranque | Win a Partnership hand that ends blocked (lower team pip count). | 1 |  |
| `p4-pass-win` | Knocked, Not Out | Win a Partnership hand in which you passed at least once. | 1 |  |
| `p4-both-pass` | Both Locked Out | Between two of your turns, make both opponents pass. | 1 |  |
| `p4-shutout` | Shutout: Partnership | Win a Partnership match in which the other team scores 0. | 1 |  |
| `p4-comeback` | Comeback: Partnership | Win a Partnership match after trailing by 50 or more points (whole match played in one sitting). | 1 |  |
| `p4-sixty` | Sixty in One | Win a Partnership hand worth at least 60 points. | 1 |  |
| `p4-ten-hands` | Partnership Regular | Win 10 Partnership hands in total. | 10 |  |
| `p4-local-partners` | Side by Side | With two players on one device sitting across as partners, win a Partnership match. | 1 |  |
| `p4-lead-66` | The Big Double | In a Partnership hand, lead with the double six. | 1 |  |

### Tactical (16)

| ID | Title | How to earn | Target | Spoiler |
| --- | --- | --- | ---: | --- |
| `tac-capicua` | ¡Capicúa! | Play your last tile when it would fit either open end. | 1 |  |
| `tac-out-double` | Double Out | Play a double as your last tile. | 1 |  |
| `tac-four-doubles` | Double Trouble | Play 4 doubles yourself in one hand. | 1 |  |
| `tac-same-ends` | Mirror Ends | After your play (not the lead), both open ends show the same number. | 1 |  |
| `tac-self-block` | Shut the Door | Make the play that blocks the hand, then win the tranque. | 1 |  |
| `tac-low-tranque` | Light Hand | Win a blocked hand while holding 5 or fewer pips yourself. | 1 |  |
| `tac-fast-out` | In a Hurry | Go out while each opponent still holds at least 4 tiles. | 1 |  |
| `tac-66-win` | Big Double, Big Finish | Lead with the double six and win that hand. | 1 |  |
| `tac-win-2pass` | Second Wind | Win a hand in which you passed at least twice. | 1 |  |
| `tac-forced5` | Lockdown | In one hand, make the next player pass 5 times right after your play. | 1 |  |
| `tac-close-suit` | Closed the Number | Make the play that puts all seven tiles of one number on the table. | 1 |  |
| `tac-clean-win` | Clean Hand | Play your last tile first, having never drawn or passed in that hand. | 1 |  |
| `tac-heavy` | Shed the Heavies | Play both the double six and the 6|5 yourself in one hand. | 1 |  |
| `tac-double-run` | Back-to-Back Doubles | Play a double on two of your turns in a row. | 1 |  |
| `tac-more-tiles` | Fewer Pips, More Tiles | Win a blocked hand while holding more tiles than any opponent. | 1 |  |
| `tac-close-call` | Close Call | Go out while an opponent is down to a single tile. | 1 |  |

### Milestones (12)

| ID | Title | How to earn | Target | Spoiler |
| --- | --- | --- | ---: | --- |
| `ms-matches-5` | Five Matches Won | Win 5 Quick Play matches against the computer. | 5 |  |
| `ms-matches-15` | Fifteen Matches Won | Win 15 Quick Play matches against the computer. | 15 |  |
| `ms-finished-10` | Ten Matches Played | Finish 10 Quick Play matches against the computer (win or lose). | 10 |  |
| `ms-hands-25` | Twenty-Five Hands | Win 25 hands in total. | 25 |  |
| `ms-hands-50` | Fifty Hands | Win 50 hands in total. | 50 |  |
| `ms-points-500` | 500 Points | Score 500 points in total from hands your side wins. | 500 |  |
| `ms-points-2000` | 2,000 Points | Score 2,000 points in total from hands your side wins. | 2000 |  |
| `ms-tiles-250` | 250 Tiles | Play 250 tiles in total. | 250 |  |
| `ms-dominoes-20` | Twenty Dominós | Go out first (dominó) 20 times yourself. | 20 |  |
| `ms-tranques-10` | Ten Tranques | Win 10 blocked hands in total. | 10 |  |
| `ms-doubles-50` | Fifty Doubles | Play 50 doubles in total. | 50 |  |
| `ms-all-modes` | Three Tables | Win at least one Quick Play match against the computer in Draw, Block and Partnership. | 3 |  |

### Story (14)

| ID | Title | How to earn | Target | Spoiler |
| --- | --- | --- | ---: | --- |
| `story-prologue` | No Rest | Finish the Story prologue. | 1 |  |
| `story-ch1` | Chapter 1 Closed | Finish Chapter 1 of the Story. | 1 |  |
| `story-ch2` | Chapter 2 Closed | Finish Chapter 2 of the Story. | 1 | hidden until earned |
| `story-ch3` | Chapter 3 Closed | Finish Chapter 3 of the Story. | 1 | hidden until earned |
| `story-ch4` | Chapter 4 Closed | Finish Chapter 4 of the Story. | 1 | hidden until earned |
| `story-ch5` | Chapter 5 Closed | Finish Chapter 5 of the Story. | 1 | hidden until earned |
| `story-ch6` | Chapter 6 Closed | Finish Chapter 6 of the Story. | 1 | hidden until earned |
| `story-ch7` | Chapter 7 Closed | Finish Chapter 7 of the Story. | 1 | hidden until earned |
| `story-epilogue` | Case Closed | Finish the Story epilogue. | 1 | hidden until earned |
| `story-wins-3` | On a Roll | Win 3 chapter hands within one case (replays don’t count). | 1 |  |
| `story-wins-7` | Seven for Seven | Win all 7 chapter hands within one case, from the prologue on (replays don’t count). | 1 |  |
| `story-partner` | Marisol’s Partner | Win a Partnership chapter hand (Chapter 3 or 7). | 1 |  |
| `story-loss` | The Case Goes On | Lose a chapter hand: the case still moves forward. | 1 |  |
| `story-no-skip` | Every Word | Finish the epilogue of a case started from the prologue without using Skip scene. | 1 | hidden until earned |

### Exploration (8)

| ID | Title | How to earn | Target | Spoiler |
| --- | --- | --- | ---: | --- |
| `ex-rules` | House Rules | Open How to Play from the menu. | 1 |  |
| `ex-stats` | Keeping Score | Open Statistics from the menu. | 1 |  |
| `ex-settings` | Your Table, Your Way | Change any setting (menu or pause sheet). | 1 |  |
| `ex-sort` | Sorted | Use the Sort button at the table. | 1 |  |
| `ex-zoom` | Closer Look | Use the + or − board zoom at the table. | 1 |  |
| `ex-story-text` | Easy on the Eyes | Change the Story text size or instant text in Settings. | 1 |  |
| `ex-local` | Pass the Device | Finish any match with two players sharing one device. | 1 |  |
| `ex-local-all` | Shared Table | Finish a two-player, one-device match in Draw, Block and Partnership. | 3 |  |

