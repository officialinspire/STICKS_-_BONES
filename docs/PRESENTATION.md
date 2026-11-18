# Presentation: art, effects, Cousin's voice, menus

Everything here is presentation. None of it can change rules, legality or
timing: the engine applies a move first, then the UI decorates it.

## Art integration (`src/render/stage.ts`, `src/ui/host.ts`)

- **Stable stage per sheet.** Every frame of a sheet is shown through a viewBox of
  the same size, anchored at the frame's bottom-centre (feet). Expression swaps and
  the slam animation therefore keep Cousin's scale and footing.
- **Guarantees, tested for every frame:**
  - the stage box contains the full content rect, so the hat is never cropped;
  - it stays inside the frame's own cell, so no atlas neighbour shows;
  - anchor drift is ≤ 6 px (the slam strip has 1–2 px gutters, so its edge frames are clamped);
  - `preserveAspectRatio="… meet"` means no distortion.
- The large Roberto atlas can't be staged cleanly (frames touch neighbours), so it
  stays unused. A test asserts this.
- **Sizes:**
  - On small screens, a compact **bust** crop is taken from the top of the stage, with the hat included.
  - On wide screens and in menus and results, the **full** figure.
- **Setting:** patio backdrop (`env.neighborhood-patio`), weathered tabletop
  (`table.weathered`), tile atlas, portrait atlas. Optional: the slam strip
  (`cousin.anim.slam`) and the effects sheet (`fx.sheet`), each loaded on first use.
- **Placeholders:** if an image fails, it's removed and a code-drawn substitute
  shows: a monogram for Cousin, gradients for the backdrop and table, vector
  faces for tiles, and a CSS ring for effects. The slam is simply skipped. E2E
  plays a game with every PNG blocked.

## Expressions and the slam

Moods follow public events:

| Event | Mood |
| --- | --- |
| Computer thinking | thinking |
| Cousin plays | smirk |
| Pass | explaining |
| A domino by a computer | laughing |
| A domino by a human | surprised |
| Match end | pumped / delighted |

The **slam** (6 frames, about 95 ms each) plays on any domino and when Cousin
plays a double. It only plays in the full-figure view, and is skipped under
reduced motion or when turned off in Settings. It is never awaited.

## Table feedback

- **Selection outline:** the selected tile is raised with an outline. Legal tiles
  show a **✓ badge** (shape, not just colour); illegal tiles are dimmed with no badge.
- **Endpoint preview:** each legal end shows a ghost of the selected tile, oriented
  exactly as it would land, with a ▼ cue and a full `aria-label`. Both ends show
  when both fit.
- **Placement easing:** the new tile settles in over 260 ms.
- **Impact effect:** a small puff on the new tile, or a gold star on a domino.
- **Pass knock:** the passer's seat chip (or the hand area) gives a short knock,
  with a ripple and the factual line "X knocks — pass."
- **Score tally:** in the results sheet, scores count up from their pre-hand
  values. Tabular numerals keep the width fixed.
- **Effects never get in the way:**
  - they are `pointer-events: none`, sit below the open-end targets (z-order),
    are removed after ≤ 0.9 s, and are cleared when a privacy cover appears;
  - they only decorate public things (board tiles, seat chips);
  - E2E checks that end targets stay topmost, effects accept no input, and the
    scoreboard stays visible during effects.
- **Reduced motion:** "Follow my device" (the default), "Reduce" or "Full". When
  reduced, there are no effects, no slam, no easing and the tally is instant. Text
  and controls never move with the art.

## Cousin's voice (`src/app/banter.ts`)

- **Opening line** of every new match: **"Fuck that, we playing DOMINOES!"**. With
  the explicit-language setting off: **"Forget that, we playing DOMINOES!"**.
  Explicit language is **on by default**, as the owner specified the line; it can
  be switched off in Settings.
- **Short contextual lines** for: a new hand, plays, doubles, passes, draws, going
  out, tranque, ties and match end. They're written in plain conversational English
  with genuine domino words (dominó, tranque), and no phonetic accents or
  stereotyped spelling.
- **Repeat suppression:** the last 8 lines are never repeated. Routine moves get a
  line only sometimes, and big moments always do.
- **Banter off:** Cousin goes quiet (the opening line too), and the factual line stays.
- **Subtitle = voice:** the bubble shows the quip and the fact, and the live
  region announces exactly the same text.
- **Privacy:** lines are chosen from public events only, so they never name a
  drawn tile.

## Screens

- **Home:** New game, Resume / Discard, How to play, Settings.
- **New game:**
  - mode, opponent, two-player names and Partnership seating, computer skill, target;
  - the **selected mode's rules**, generated from preset data (`src/ui/rules-summary.ts`),
    shown above "Deal the tiles".
- **How to play:** all three modes.
- **Settings:** language, banter, slam animation, motion, computer speed
  (thinking delay only).
- **In game:** a compact HUD (Pause and scores). The **pause sheet** has Resume,
  Restart match, Leave to menu, Rules and Settings. Restart and Leave ask for
  confirmation, and pausing stops computer moves.
- **Results:** hands revealed, larger Cousin art, points, the score tally, and
  match winner → **Rematch** (same setup, new deal; works for resumed games too)
  or Menu.
