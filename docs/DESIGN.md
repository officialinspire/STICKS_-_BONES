# Visual identity and design system

**Art direction:** a hand-painted Puerto Rican neighborhood domino-club sign meets a
sun-faded tropical detective paperback. Confident, warm, atmospheric and slightly
dangerous. **Ivory domino faces stay the clearest objects during play:** decoration lives
at the edges, never across the hand, the board or the pips.

## Tokens (`src/ui/tokens.ts`, declared once in `src/styles.css :root`)

| Token | Hex | CSS variable |
| --- | --- | --- |
| Deep sea | `#083F43` | `--sb-deep-sea` |
| Caribbean teal | `#087F80` | `--sb-teal` |
| Guava coral | `#D94F45` | `--sb-guava` |
| Sun gold | `#F2B544` | `--sb-gold` |
| Warm ivory | `#FFF2D8` | `--sb-ivory` |
| Night ink | `#14252B` | `--sb-ink` |

Two derived values are used for text and hairlines on ivory: `--ink-soft` `#33494f`
(9.3:1) and `--cream-2` `#e7d5b0` (decorative hairlines only). The older variable names
(`--teal`, `--sun`, `--cream`, …) now point at these tokens, so every older screen uses
the new identity.

### Approved pairings

The palette is **not** permission to use every pairing. `src/ui/tokens.test.ts`
recomputes every ratio and checks that `styles.css` declares exactly these hex values.

| Foreground / background | Ratio | Allowed for |
| --- | ---: | --- |
| ink / ivory | 14.25 | body text, dialogue, sheets, cards; focus-ring inner band |
| deep sea / ivory | 10.51 | headings, speaker labels on light panels |
| ivory / deep sea | 10.51 | text on dark panels, HUD, destination buttons |
| ivory / ink | 14.25 | night panels, privacy cover |
| ink / gold | 8.63 | **primary buttons** (gold fill, dark text) |
| gold / deep sea | 6.36 | highlights on dark (turn banner, your score); focus ring on dark |
| gold / ink | 8.63 | highlights and focus ring on night panels |
| teal / ivory | 4.35 | **large/bold text only**; borders |
| guava / ivory | 3.68 | **large/bold text only**; destructive-button outline |
| ivory @ 62% / deep sea (disabled) | 5.03 | disabled labels on dark (exempt from 1.4.3, still ≥ 3) |
| ink @ 55% / ivory (disabled) | 3.57 | disabled labels on light (exempt, still ≥ 3) |

**Forbidden for text** (each asserted to stay below 3:1): gold/ivory (1.65),
teal/guava, deep sea/ink, gold/guava, teal/deep sea.

**Scrims** over photographic backdrops are checked against the worst possible pixel
(pure white or black):

| Scrim | Text on it | Worst-case ratio |
| --- | --- | ---: |
| deep sea at 84% | ivory | 6.56 |
| ink at 86% | ivory | 9.19 |
| ink at 86% | gold | ≥ 4.5 |

**Focus:** a two-tone ring (`--focus-ring`): a 2 px ink inner band (visible on light
surfaces) and a 3 px gold outer band (visible on dark ones), plus a transparent outline
for forced-colors mode.

**Destructive actions** use an ivory button with ink text, a guava outline and a ⚠ mark.
Ivory text on guava would be only 3.68:1.

## Typography

| Role | Family | Files | License |
| --- | --- | --- | --- |
| Display: headings, destination titles, chapter cards, scores | **Bricolage Grotesque** (Mathieu Triay), weight 600–800, width 75–100% | `src/assets/fonts/bricolage-grotesque-latin-var.woff2`, 61 KB | SIL OFL 1.1 (`public/licenses/Bricolage-Grotesque-OFL.txt`) |
| Dialogue, controls, body | **DM Sans** (Colophon Foundry), weight 400–800 | `src/assets/fonts/dm-sans-latin-var.woff2`, 21 KB | SIL OFL 1.1 (`public/licenses/DM-Sans-OFL.txt`) |

- **Source and build:**
  - Sources are the official `google/fonts` repository (`ofl/dmsans`, `ofl/bricolagegrotesque`).
  - Neither license declares a Reserved Font Name, so the subsets keep their names.
  - Rebuild with `pip install fonttools brotli`, then `python3 scripts/build-fonts.py <folder with the sources>`.
  - The license texts are shipped with the site in `licenses/`.
- **Character subset:**
  - Basic Latin and Latin-1: every Spanish accent, ñ/Ñ, ü, ¿, ¡.
  - Typographic quotes, dashes and ellipsis, plus the bullet and euro signs.
  - Measured as missing: only the soft hyphen and the two prime marks, none of which the game uses.
- **Tabular scores:**
  - Bricolage Grotesque has a real `tnum` feature; this DM Sans build has none (its digits vary from 312 to 684 units).
  - Scores, tallies and counters therefore use Bricolage with `font-variant-numeric: tabular-nums`.
  - QA measures every digit 0–9 at the same width (48.73 px for four digits).
- **No layout shift:**
  - `font-display: swap` with metric-matched fallback faces.
  - `size-adjust` measured in Chromium: DM Sans 101.65% of Arial/Liberation Sans; Bricolage 800 96.5% of Arial Bold.
  - Ascent and descent overrides come from each font's own metrics.
  - Measured cumulative layout shift from load to the menu: **0.0199**.
- **User text size:** the base font is `1rem`, so the player's browser text-size setting applies. QA sets the browser default to 150% and 200% and checks the menu, Story and setup for overflow and clipping.
- **No cursive or thin ornamental type.** The fonts aren't presented as "Puerto Rican" in themselves: the local character comes from the art, language and composition.

## Wordmark (`src/assets/brand/`, built by `scripts/build-wordmark.py`)

| File | Use |
| --- | --- |
| `wordmark.svg` | Vector master: two stacked lines (STICKS / & BONES), ivory face, deep-sea outline and extrusion, guava ampersand. |
| `wordmark-mono.svg` | One colour (`currentColor`): stamps, watermarks, print. |
| `wordmark-compact.svg` | One line for short landscape screens and tight headers. |

- **Letterforms:** Bricolage Grotesque outlines at weight 800, width 75, optical size 96. Each letter is tilted and nudged by a small fixed amount for a painted-sign feel.
- **Ampersand:** an ampersand silhouette with a small ivory domino (divider and three pips) laid across its tail as the connecting link. It still reads as "&" at small sizes (checked at 20 dpi).
- **No decoration:** no sacred or Taíno imagery, no baked-in buttons.
- **Accessibility:** the SVG art is `aria-hidden`; the heading carries real text ("STICKS & BONES", or "STICKS & BONES: NO REST FOR COUSIN" on Story).
- **Story subtitle:** **NO REST FOR COUSIN** is code-rendered text: a gold-on-ink tag with a guava offset shadow.
- **Placement:** the master shows in portrait, tablet and desktop; the compact mark in short landscape.

## Destinations and layouts

| | Portrait phone | Short landscape (≤ 560 px tall) | Tablet | Desktop (≥ 1000 px) |
| --- | --- | --- | --- | --- |
| Home | Wordmark, then Story (gold primary: New Case / Continue Case · chapter / Case Closed) / Quick Play (deep sea) / Two Players (ink), then How to Play · Settings · Statistics · Achievements in one grid, then Cousin's greeting | Compact wordmark and Cousin on the left, destinations on the right, nothing below the fold | Stacked with a medium wordmark | Wordmark across the top, Cousin left, menu panel right (max 1080 px, no stretched panels) |
| Story case file | Stacked: actions, chapters, notebook | Two columns: head + actions, chapters + notebook | Stacked | Actions + chapters left, notebook right |
| Story scene | Scene bar, dialogue panel bottom-anchored, controls at thumb reach | Same, with tighter type | Same, max 980 px | Same |

- **Quick Play** opens setup with the computer opponent selected, **Two Players** with one shared device. Both can still switch. The heading follows the choice.
- **Sub-pages** (setup, How to Play, Settings, Statistics, Achievements) use the compact one-line mark. They return home with "← Menu", Escape or the browser's Back, with focus restored to the opener. On desktop the panel widens and Cousin stays in view beside it.
- **Confirmations:** every destructive action (discard a saved game, reset statistics, erase data, start the Story over) uses one ivory confirmation sheet (`src/ui/confirm.ts`). Focus starts on the safe choice, Escape cancels, and the destructive button has the guava outline and ⚠ mark.
- **Achievements** (`docs/ACHIEVEMENTS.md`):
  - The page shows the unlocked count, category and status filters, and a card per achievement with an SVG badge, how to earn it and a progress bar.
  - Story spoilers are concealed until earned.
  - Unlock notices are quiet toasts on ink with a gold border. They never appear over a handoff cover, a sheet, a Story scene, or while the player can act at the table.
- **Story** has New Case / Continue Case, a confirmed "start over" that resets Story progress only, chapter selection (all seven chapters with real titles, locations and hands from the script; replay is labelled "next stage"), and a compact notebook with an evidence panel.

## Components (`src/ui/story-ui.ts`, styled in `src/styles.css`)

- **Speaker label:** a painted tag; Roberto's is gold, others deep sea. The script's qualifier ("narration") is kept.
- **Dialogue panel:** ivory with an ink border and offset shadow. **Caption panel:** for stage directions, ink scrim with italic ivory text. Plot-critical sounds are written out (e.g. the knocks).
- **Chapter card:** chapter number, title, location, hand and a status badge (Completed, Up next, In progress, Not reached yet). Has full and compact forms.
- **Evidence panel:** dashed frame with a list or an empty state. **Notebook entry:** a ruled notebook with a guava margin rule.
- **Dialogue panel actions:** the panel holds the speaker name, the line, and ONE action: **Continue** (gold, 48 px).
  - Continue sits below the text on portrait phones and short landscape, and beside it elsewhere.
  - The first activation completes a line that is still revealing; the next advances exactly one beat.
  - Taps closer together than 180 ms and key auto-repeat are ignored. On Continue, Enter and Space are its own click (never two activations).
  - A line too long for the space left (the largest text on the smallest screens) scrolls inside the panel, focusable, and Continue never leaves the screen.
- **Scene navigation (outside the panel, in the bar):** ← Case file, ‹ Back, Skip and the position counter.
  - Keyboard: Enter, Space or → advances; ← goes back.
  - Reduced motion: no entrance animation.
- **Story text preferences** live in Settings: text size (Standard / Large / Larger: 100 / 115 / 130 %) and "Show each line at once" (instant text).
- **Pause, results and confirm sheets, and privacy covers** are re-skinned: ivory, ink border, deep-sea offset shadow. Match winners get a guava ★.

## Hand targets

- **Tile size:** 40 px wide on ≤ 380 px screens, 44 px from 381–899 px, and 38 px in short landscape. That keeps a 7-tile hand on one row without scrolling, and the pips large (≥ 7 px).
- **Hit area:** each tile's `::before` extends 4 px above and below and **half the gap** on each side, so neighbouring hit areas meet without overlapping. That's 40 + 4 = 44 px and 38 + 6 = 44 px.
- **Verified:** QA measures these extended areas, and the 44 px "comfortable" warnings are now gone on every viewport.
- **Unchanged:** both-ends selection, long-hand scrolling, keyboard order and privacy covers.
