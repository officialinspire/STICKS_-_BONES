# Cousin's House Rules (v1)

> Dominoes rules vary across Puerto Rico, between families and from table to table.
> These are **Cousin's House Rules**: the defaults STICKS & BONES uses. They are
> **not** the only correct Puerto Rican rules.

The machine-readable version is `COUSINS_HOUSE_RULES_V1` in
[`src/engine/rules/presets.ts`](../src/engine/rules/presets.ts) (preset id
`cousins-house-rules`, version `1`). The engine reads its behaviour from that
preset's fields. When this document and the preset disagree, that's a bug: fix
both together. A published version never changes. Changing a rule means adding
version 2 and keeping version 1 so saved games still load.

## Shared rules (all modes)

| Rule | House default |
| --- | --- |
| Set | Double-six: all 28 unique unordered pairs of 0–6 (`t00` … `t66`, high pip first). |
| Blank | Worth zero. |
| Tiles per seat | 7 |
| Doubles | Played crosswise. **Never spinners.** The line always has exactly **two open ends**. |
| Legal move | Attach a tile with an equal pip value to one of the two open ends. |
| Must play | If you hold a legal move you must play. You can't pass or draw while you hold a legal tile. |
| Hand ends | (a) a seat empties its hand (**out** / "domino"), or (b) nobody can play under the mode's draw/pass rules (**blocked**). |
| Scoring | Resolved **exactly once** per hand. |
| Bonuses | **None in v1.** No capicú, chuchazo, forced-pass bonus, or forced redeal. |

Values are always read from canonical tile data. Rules are never inferred from artwork.

## Seats and turn order

Seat indices are fixed and play always goes to `next = (seat + 1) % seatCount`,
which is **counterclockwise** around the table when seen from above. On screen,
seat 0 is the bottom seat (the local player's view).

```
Partnership (4 seats)                     Two-player modes
                                          
          ┌──────────┐                            ┌──────────┐
          │ Seat 2   │  partner of 0              │ Seat 1   │
          │  (top)   │                            │  (top)   │
          └──────────┘                            └──────────┘
 ┌────────┐   ↙   ↖   ┌────────┐                      ↓   ↑
 │ Seat 3 │           │ Seat 1 │                  ┌──────────┐
 │ (left) │   ↘   ↗   │(right) │                  │ Seat 0   │
 └────────┘           └────────┘                  │ (bottom) │
          ┌──────────┐                            └──────────┘
          │ Seat 0   │  you                    
          │ (bottom) │                         0 → 1 → 0 → …
          └──────────┘
   0 → 1 → 2 → 3 → 0   (bottom → right → top → left)
   Team A = seats 0 + 2      Team B = seats 1 + 3
```

The screen mapping (`tablePosition` in `src/engine/seats.ts`) is presentation
only. The engine knows only indices.

## Two-player Draw (`draw2`)

- **Deal:** 7 tiles each. The other **14 tiles form the boneyard**.
- **Can't play:** draw one tile at a time until you draw a playable tile or the
  boneyard runs out. A playable drawn tile **must be played that same turn**.
  You can't draw while you hold a legal tile. **Pass only** when you have no
  legal move and the boneyard is empty.
- **First hand opener:** whoever holds the **highest double**. If neither player
  holds a double, the **highest pip-total tile** opens, with ties broken by the
  **higher end** (e.g. 6‑3 beats 5‑4). The opener must lead **that tile**.
- **Later hands:** the previous hand's winner opens with **any tile**.
- **Hand winner:** the player who goes out, or at a block the player with the
  **lower pip total**.
- **Points:** the winner scores **all pips left in both hands**. At a block that
  includes the winner's own pips.
- **Blocked tie:** both players hold the same pip total. The hand scores **zero**,
  and the next hand uses the first-hand opening selection again.
- **Target:** 100 by default (menu may offer 100 or 200).

## Two-player Block (`block2`)

- **Deal:** 7 tiles each. The other **14 are set aside unused** and stay hidden.
- **No drawing.** If you can't play, you pass.
- **First hand opener:** same selection as Draw (highest double, else heaviest
  tile, ties by higher end). The opener must lead that tile.
- **Later hands:** the opening seat **alternates** between the two players (the
  seat after the previous opener), with any tile, whoever won.
- **Out:** the winner scores the **opponent's** remaining pips.
- **Block:** the lower-pip player wins and scores **opponent pips minus own pips**.
- **Blocked tie:** zero. Rotation continues as normal.
- **Target:** 100 by default (menu may offer 100 or 200).

## Four-player Partnership (`partnership4`)

- **Teams:** seats **0 + 2** vs **1 + 3**. Partners sit opposite.
- **Deal:** 7 tiles each, all 28 dealt, **no boneyard**. Can't play means pass.
- **First hand:** whoever holds the **double-six** must lead it.
- **After an out:** the player who went out opens the next hand with any tile.
- **After a block:** the team with the **lower combined pips** wins. The
  **lower-pip member of the winning team** opens next with any tile. If both
  teammates hold the same total, the opener is whichever comes **first in turn
  order starting from the previous hand's opener**.
- **Points:** the winning team scores **all unplayed hand pips** (all four hands),
  whether they won by going out or at a block.
- **Tied team totals at a block:** zero. The next hand is opened by whoever holds
  the double-six (who must lead it).
- **Target:** 200 by default (menu may offer 100 or 200).

## Match configuration

`validateMatchConfig` (`src/engine/config.ts`) accepts untrusted input and rejects:

- unknown preset id/version, unknown mode, schema version mismatch;
- a target not in the mode's `target.allowed` list (v1: 100 or 200);
- a seat count that doesn't match the mode (2, 2 or 4), or seats out of order;
- zero humans, or three or more humans. Supported setups are **solo vs AI** (1 human)
  and **two local humans on one device** (2 humans, slots 0 and 1);
- invalid controller kinds, AI profiles or display names.

AI fills every seat without a human. In Partnership, two humans may be partners
(`[0, 2]`, the default suggestion) or opponents (`[0, 1]`).

Configs never contain seeds or RNG state. Those reveal hidden hands and belong
only to in-memory or saved match state. They must stay out of URLs, logs,
analytics, DOM labels and pass-and-play handoff screens.

## Sources and how we differ

No rules documents came with the prompt pack or the repository. We checked the
references below on 2026‑11‑15 and use them for comparison only:

- John McLeod, pagat.com — [Draw Dominoes](https://www.pagat.com/domino/line/draw.html),
  [Block Dominoes](https://www.pagat.com/domino/line/block.html),
  [Partnership Dominoes](https://www.pagat.com/domino/line/partnership.html),
  [Basic mechanics](https://www.pagat.com/domino/basics.html).

Where Cousin's House Rules make a **chosen house default** rather than follow a
single "standard":

- **Partnership scoring counts all four hands.** pagat describes scoring only the
  losers' tiles as one common method, and notes that some versions (FID, and
  Puerto Rico's *Doscientos*) count all unplayed tiles. We count all of them.
- **Target 200 for Partnership**, in line with the Doscientos/FID-style 200, where
  100 is common elsewhere.
- **Later-hand openers** follow the winner (Draw, Partnership-out) or the
  lowest member of the winning team (Partnership block), not a fixed rotation
  to the right. Block mode alternates.
- **No bonuses.** pagat lists Puerto Rican bonuses such as capicú and chuchazo.
  We leave them out of v1 on purpose. A later preset version could add them as
  explicit, versioned fields.
- **Draw-mode block scoring** gives the winner every remaining pip, their own
  included. Block-mode block scoring uses the difference. Both are house choices.
