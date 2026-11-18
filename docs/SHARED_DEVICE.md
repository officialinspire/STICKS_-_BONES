# Two players, one device

Draw, Block and Partnership can be played by **exactly two humans sharing one
device**. In Partnership the other two seats are computer players.

## Seating (chosen before dealing)

| Mode | Player 1 | Player 2 | Computers |
| --- | --- | --- | --- |
| Draw / Block | seat 0 | seat 1 | — |
| Partnership, "Across — partners" | seat 0 | seat 2 | seats 1 and 3 (Cousin, Tío Rafa) |
| Partnership, "Right of Player 1 — opponents" | seat 0 | seat 1 (plays next) | seats 2 (Luz, Player 1's partner) and 3 (Tío Rafa, Player 2's partner) |
| Partnership, "Left of Player 1 — opponents" | seat 0 | seat 3 (plays before) | seats 1 (Cousin, Player 2's partner) and 2 (Luz, Player 1's partner) |

Teams are always seats 0+2 against 1+3 and turn order is always counterclockwise,
so seating only decides who is whose partner. Player names (up to 20 printable
characters) are stored in the match config and shown in the scores and on the
cover.

## Controller state machine (`src/app/privacy.ts`)

This is independent of game legality. It sees only coarse public facts: the phase,
whose turn it is, whether that seat is human, and whether privacy is on.

```
                ┌──────── game: another human's turn / new hand / restored ───────┐
                ▼                                                                 │
   covered ──Ready──► revealing ──Reveal hand──► human-turn ──play/pass──► (next actor)
     ▲  ▲                 │ "Not <name>"              │ draw: stays human-turn
     │  └─────────────────┘                           │
     │                     ai-turn ◄── computer's turn (public table, no hand)
     │                     round-results ◄── hand ended / scored (public)
     └── resume ◄── paused ◄── dialog opened, tab hidden, app switched
     └── conceal ◄── tab hidden, orientation change (from human-turn/revealing)
```

- With two humans, every entry into a human turn from any other state goes
  **covered → revealing → human-turn**, with two explicit taps: *I'm \<name\> — ready*,
  then *Reveal hand*. That includes the same human getting the device back after
  computer turns.
- A **pause** (an open confirmation, a hidden tab, `pagehide`) remembers nothing
  private. **Resume** re-derives the state from scratch and lands on the cover. A
  hidden tab or an **orientation change** covers immediately. A **restored game**
  starts covered.
- In solo play (one human) privacy is off: there's no cover, and the human always
  sees their own hand, even during computer turns.

## What is (and isn't) rendered

The UI renders only `TableController.view()`:

- **human-turn:** that human's `SeatView` (their hand and legal moves only).
- **every other state:** `concealedView(perspective)`, the public table with **no hand
  at all**, no legal moves, and the opening requirement hidden until it's played.
  The board, scores, tile counts, seat badges and finished-hand results are public.

Consequences:

- Hidden tiles aren't in invisible DOM. The hand region contains only a short
  message, and there are no tile `data-*` attributes, labels or tooltips.
- While the cover is up, the whole table subtree is `inert` and `aria-hidden`. The
  cover is a separate `aria-modal` dialog, so screen readers and focus can't reach
  the table.
- The bubble and the live region are public. On a shared device they never name a
  drawn tile ("Ana drew from the boneyard"). The drawer sees the tile in the
  status line next to their hand, which leaves with the hand.
- Engine events are redacted for whichever seat is revealed after each change.
  Covered, AI-turn and results screens never receive a drawn tile.
- Status hints and tile selection are cleared whenever the hand isn't revealed.

## Saves

The table autosaves after every change (`src/app/save.ts`, browser `localStorage`).
Reloading lands on the menu with **Resume** and a public summary (mode, team
names, scores, hand number). Resuming a two-human game opens on the cover.

This is **ordinary shared-device protection, not cryptographic protection**. The
save holds the full state, so anyone with devtools or storage access can read it.
It's never sent anywhere.

## Verification

- `src/app/privacy.test.ts`: state-machine transitions, including pause, conceal,
  restore and stale reveals.
- `src/app/controller.test.ts`: all five two-human seatings play 3+ complete hands
  through the controller, with random tab-hide/resume and orientation events. At
  every step the rendered view contains no tile from any hand except the revealed
  human's own. Every human turn is preceded by covered → revealing for that human.
  No drawn tile is delivered while covered. Turn order, scores and team names are
  checked against the seating. Also: restored games open covered, solo never
  covers, and intents from a covered screen are ignored.
- `npm run e2e`: every seating plays 2 complete hands in the browser.
  - A DOM mutation recorder reports any hand tile present while covered or off-turn (0 found).
  - Under the cover: the table is `inert`, the accessibility snapshot has no hand
    labels, and no drawn tile appears in the live region or bubble.
  - Tab hide, orientation change and a cancelled menu each re-cover.
  - Reload → Resume opens covered with no flash during hydration.
