/**
 * End credits for NO REST FOR COUSIN ("Cut to title, then credits." — the script's last direction).
 *
 * Every name and licence below is taken from the repository's verified provenance, and `credits.test.ts` checks it
 * against the source records, so the credits can't drift from them:
 *   - music titles: src/assets/audio-manifest.ts (MUSIC; owner uploads, artist tag "officialinspire");
 *   - owner recordings: src/assets/owner-audio.json (the music uploads carry the artist tag; the domino recordings
 *     carry none, so they are credited to the owner, not to a name);
 *   - sound effects and ambience: src/assets/sound-manifest.json (creator, licence, pack);
 *   - fonts: src/assets/fonts/*-OFL.txt (copyright line) and fonts.json (licence);
 *   - the studio credit: INTRO_VIDEO in src/assets/audio-manifest.ts.
 * No person is named who isn't named in those records. Plain data: no state, no game logic.
 */
export interface CreditLine {
  readonly role: string;
  readonly name: string;
  readonly note?: string;
}
export interface CreditPage {
  readonly title: string;
  readonly lines: readonly CreditLine[];
}

export const CREDITS: readonly CreditPage[] = [
  {
    title: 'The case',
    lines: [
      { role: 'Game', name: 'STICKS & BONES' },
      { role: 'Story', name: 'NO REST FOR COUSIN', note: 'Approved script v0.2' },
      { role: 'Presented by', name: 'INSPIRE' },
    ],
  },
  {
    title: 'Music',
    lines: [
      { role: 'Original music', name: 'officialinspire', note: 'Patio Dominoes (Take 2) · Domino Table (Subtle Vibe) · Promenade After Dark · The Lit Threshold (Alt)' },
      { role: 'Result cues', name: 'officialinspire', note: 'Round Win (Puerto Rico Vibe) · Round Other (Musical Shrug)' },
      { role: 'Domino slam and deal', name: 'The owner’s own recordings of real dominoes' },
    ],
  },
  {
    title: 'Art',
    lines: [
      { role: 'Characters, places, tiles, effects and the evidence card', name: 'Owner-supplied art' },
      { role: 'Studio credit', name: 'INSPIRE', note: 'Intro video' },
    ],
  },
  {
    title: 'Sound effects',
    lines: [
      { role: 'Interface and table sounds', name: 'Kenney (Kenney Vleugels)', note: 'Interface Sounds 1.0 · Casino Audio 1.1 · CC0 1.0' },
      { role: 'Knocks, water, glass and ambience', name: 'Joseph Sardin (BigSoundBank)', note: 'CC0 1.0' },
    ],
  },
  {
    title: 'Fonts',
    lines: [
      { role: 'DM Sans', name: 'Copyright 2014 The DM Sans Project Authors', note: 'SIL Open Font License 1.1' },
      { role: 'Bricolage Grotesque', name: 'Copyright 2022 The Bricolage Grotesque Project Authors', note: 'SIL Open Font License 1.1' },
    ],
  },
];
