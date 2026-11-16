# Manual playtest checklist (about 30 minutes)

Use the deployed site, or a local `npm run build` followed by `npm run preview`.
Do one pass on a phone and one on a desktop browser. Note the device, browser and
build: the build is shown as `<html data-build>`, and is the commit SHA prefix on
the deployed site. Tick each item and write down anything odd.

## First run
- [ ] The start screen appears. Tapping starts the game with **no sound** until the menu.
- [ ] Menu music starts after the tap and respects the mute and volume settings.
- [ ] The menu shows "✓ Ready to play offline (…MB…)" within a minute (on the deployed site).
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
- [ ] After "Ready to play offline", turn on airplane mode, reopen the site, and
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
