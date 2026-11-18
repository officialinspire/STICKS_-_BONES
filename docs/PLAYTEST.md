# Manual playtest checklist (about 30 minutes)

Use the deployed site, or a local `npm run build` followed by `npm run preview`.
Do one pass on a phone and one on a desktop browser. Note the device, browser and
build: the build is shown as `<html data-build>`, and is the commit SHA prefix on
the deployed site. Tick each item and write down anything odd.

## First run
- [ ] The start screen appears. Tapping starts the game with **no sound** until the menu.
- [ ] Menu music starts after the tap and respects the mute and volume settings.
- [ ] The menu shows "✓ Quick Play is ready offline (…MB…)" within a minute (on the deployed site).
- [ ] How to play: opening, drawing/passing, blocked scoring, turn direction and
  the bonuses that are *not* played are all covered and readable.

## Solo vs Cousin
- [ ] **Draw** on Easy: play a full match to 100. Drawing is forced only when you can't play.
- [ ] **Block** on Normal: no boneyard; passing works; a blocked hand is scored with readable pip arithmetic.
- [ ] **Partnership** on Hard: four seats, counterclockwise order, partner shown, match to 200.
- [ ] Results sheet: the arithmetic adds up, the title is visible, and **Next hand** and **Rematch** work.
- [ ] Cousin's opening line plays (explicit or clean, as set in Settings).

## Two players, one device
- [ ] Draw and Partnership with two humans: the cover appears between turns and
  neither hand is ever visible to the wrong player, including:
  - after a reload;
  - after switching apps;
  - after rotating the phone.
- [ ] Partnership seatings across / right / left all play.

## Saves and updates
- [ ] Mid-match, reload the page → **Resume** restores the same board and scores.
  Two humans resume behind the cover.
- [ ] Leave to the menu → Resume. Discard → "Saved game discarded."
- [ ] Statistics count wins and losses. Abandoned games are listed separately.

## Offline (on the deployed site)
- [ ] After "Quick Play is ready offline", turn on airplane mode, reopen the site, and
  finish a hand. Music is silent; there are no errors.
- [ ] Settings → **Repair offline files** returns to "Ready". The saved game and settings survive.
- [ ] Install to the home screen / desktop. The icon looks right in a circle mask
  (Android) and a rounded square (iOS).
- [ ] After a new deploy, **Update available** appears (menu, or the pause sheet
  in a match). **Update now** keeps the game and hides hands.

## Accessibility and comfort
- [ ] Everything is reachable with the keyboard. Focus rings are visible. Esc closes Pause.
- [ ] With the screen reader on (VoiceOver / TalkBack / NVDA), the hand reads only
  on your turn, and nothing reads under the cover.
- [ ] With reduced motion on: no slam, no effects.
- [ ] Phone landscape: the whole board and both open ends are visible, and the
  hand fits.

## Look and sound
- [ ] All character, table, tile and backdrop art is the owner's approved art. A
  monogram or gradient should appear only if a file failed.
- [ ] Sound effects and ambience are labelled **(placeholder)** in Settings. They
  are synthesized stand-ins, not final audio.

## Story pacing: how to time a real new-player run

The 90–110 minute target can only be confirmed by people playing. Bots don't count: `npm run story:route`
plays the whole case through the UI in about 3 minutes with instant reading.

**The build's own estimate is far below the target.** That estimate is a reading-time model, not a
measurement. The shown text is about 4,300 words in 434 lines and captions, plus seven single hands. At
160–200 words a minute, plus 1.2–1.5 s to tap on and 6–10 s per table action, a run comes to roughly
**36–48 minutes**. The playtests have to settle this. If real players also finish well under 90 minutes,
it's an owner decision (for example, using the script's optional table lines in hands, or longer
matches). The approved story is not padded or changed by the build.

**Timing hooks:** every scene writes standard browser performance measures, which aren't stored or sent:
`story:<scene>:pre` (dialogue before the hand), `story:<scene>:hand` and `story:<scene>:post`. After a
session, open the browser console on the game tab and run:

```js
performance.getEntriesByType('measure').filter((m) => m.name.startsWith('story:')).map((m) => `${m.name} ${(m.duration / 60000).toFixed(1)} min`).join('\n')
```

The measures reset on reload. If a tester reloads, note the time shown before the reload. Time in a hidden
tab is included, so note any breaks.

**Session sheet (per tester):** prior dominoes experience (none / casual / regular); device; start and end
time; the measures above; where they paused, skipped (the Skip control) or got lost; whether every chapter
made sense regardless of the hand's result.

**Pass:** at least 3 first-time players; the median full run between 90 and 110 minutes, and every run under
120 minutes. Until then, human timing is **unverified**.
