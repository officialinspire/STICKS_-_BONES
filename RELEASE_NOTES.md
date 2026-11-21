# STICKS & BONES — Release notes

## Update (2026-11-21), from mobile playtesting

- **Draw button always reachable:** on phones held upright, drawing a long run of tiles no longer pushes the Draw
  button under the board.
- **Movie-style credits:** the end credits now roll up the screen like a film. Tap to pause, tap again to carry on,
  or Skip. With reduced motion turned on they're a still list you can scroll.

## 1.0.0-rc.3 (2026-11-19), live release candidate

Live at https://officialinspire.github.io/STICKS_-_BONES/ since 2026-11-19 (each deployment's build is recorded in
`docs/RELEASE_PLAN.md`). New since rc.2:

- **The whole game works offline**: one download saves everything (about 20 MB), checked file by file, with Retry,
  progress and honest storage messages. The studio intro video plays offline too.
- **Story help:** Finish hand with AI (labelled; the real result still moves the case on), a transcript of what
  you've read, a short recap after Skip, and first-hand table tips you can turn off.
- **Chapter 6** now has its own art for the rest area by the cave entrance.
- **Evidence cards** in the case file, and a **title and credits** sequence at the end of the case.
- **Firefox and Safari engines:** the whole release test set now runs in Firefox and WebKit as well as Chrome's
  engine. That found and fixed: the full-game download not starting in Firefox until you answered its storage
  prompt; a console error in Firefox while music streamed; keyboard focus getting lost when a table opened; the
  Story scrolling sideways after rotating in WebKit; and the "Take over" button being hard to tap while the AI played.

Still a release candidate: it hasn't been tried on real phones and tablets, nobody has listened through the sound,
and the story hasn't been timed with first-time players (`docs/RELEASE_CHECKLIST.md`). Analytics stays off.

## 1.0.0-rc.2 (2026-11-17), not deployed at the time

New in this candidate:

- **NO REST FOR COUSIN**, the story. Play Roberto "Cousin" from the dream at the waterfall to the last
  knock at the gate. There's one hand in each of seven chapters, and every result (win, loss or blocked
  tie) moves the case on. You meet Marisol, Tío Rafa, Luz and Tomás Vale; the case file keeps your place,
  your notebook and replays.
- **Sound:** table and menu sounds, scene ambience (patio, surf, jungle, cave, terrace) and the knocks.
  Some sounds are stand-ins until the final recordings arrive.
- **Offline:** take the whole story offline (3.2 MB). Music and ambience offline are optional (9.1 MB).
- **Updates mid-case** bring you back to the same line or hand.
- Small phones held sideways now show the whole board.

Known limits: tested in Chromium only. The story's playing time hasn't been timed with real players yet.

## 1.0.0-rc.1 (2026-11-16), the Quick Play release candidate

Traditional Puerto Rican dominoes in the browser, hosted by Roberto "Cousin".
It installs as an app and plays offline after one complete online visit.

### Play
- **Three modes**, all under the rules preset **Cousin's House Rules v1**
  (`cousins-house-rules@1`):
  - **Draw**: 2 players, 7 tiles each, draw from the boneyard when you can't play,
    to 100.
  - **Block**: 2 players, no drawing; pass when you can't play, to 100.
  - **Partnership**: 4 seats in two teams with partners across, counterclockwise
    turns, no boneyard, to 200.
- **Opponents:**
  - Solo against the computer: Easy, Normal or Hard. The computer only sees what
    a fair player would.
  - Two people on one device: privacy covers between turns.
  - In Partnership, the second human can sit across (your partner) or to your
    right or left (an opponent).
- **Results:** every hand shows its pip arithmetic. Blocked hands, ties and the
  bonuses that aren't played are all explained in **How to play**.
- **Saves and statistics:**
  - the match is saved after every move and resumes exactly;
  - abandoned games are counted separately from losses.

### Presentation
- Cousin's art, the patio backdrop, the weathered tabletop and the tile faces all
  come from the owner's approved art. They are served as optimized WebP copies;
  the originals are untouched.
- Two approved music tracks: "Patio Dominoes (Take 2)" on the menu and "Domino
  Table (Subtle Vibe)" in play.
- Opening line: "Fuck that, we playing DOMINOES!". A clean-language setting gives
  "Forget that, we playing DOMINOES!".
- Reduced motion, keyboard play, screen-reader support, 44-px touch targets, and
  layouts for phones in both orientations, tablets and laptops.

### Offline, install and updates
- Installable PWA from the GitHub Pages subpath.
- After the first visit completes, about **1.6 MB** is stored for offline play.
  Music always needs a connection.
- "Update available" waits for the player. Updating saves the match and hides
  any hand first.
- Settings → **Repair offline files**. **Erase** is separate and only removes
  this game's data.

### Not in this release
- **Analytics:** disabled. No INSPIRE analytics contract was supplied for this
  game; see `docs/ANALYTICS.md`.
- **Studio intro video:** not supplied. The start screen fades straight to the
  menu.
- **Placeholders:**
  - sound effects and patio ambience are synthesized placeholders, labelled as
    such in Settings;
  - there is no recorded voice (Cousin's lines are subtitles).
- **Music:** tracks restart after their composed ending. The loop points still
  need the owner's audition.
- **Browsers:** tested in Chromium only. Firefox, Safari and real devices are on
  the playtest checklist (`docs/PLAYTEST.md`).
