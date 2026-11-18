/**
 * Player-facing captions for stage directions.
 *
 * The approved script (verbatim in script.json) mixes STAGING ("[Water. A narrow line of warm light…]")
 * with the writer's IMPLEMENTATION NOTES ("[This is the first direct Virginia-past passage. No
 * flashback…]"); its own preface says square brackets are "staging and implementation notes, not spoken
 * dialogue". Players see the staging as descriptive captions. Implementation notes are omitted from the
 * player's view only — the script data is unchanged, dialogue is never touched, and every omitted
 * fragment below is tested to exist verbatim in the script (so a script edit can't silently change it).
 *
 * The list is deliberately narrow and owner-reviewable (docs/STORY_BUILD_STATUS.md):
 *   NOTE_BLOCKS  whole brackets that are only writer's notes → a silent beat (keeps beat indices stable)
 *   OMIT         production fragments inside otherwise-staging brackets → removed from the caption
 */
export const NOTE_BLOCKS: readonly string[] = [
  '[This is the first direct Virginia-past passage. No flashback, outbreak terminology, or explanation.]',
  '[Let the player advance through a silent character beat.]',
  '[Second and final direct Virginia-past passage. Its circumstances remain unspoken.]',
];

export const OMIT: readonly string[] = [
  'Common continuation. ',
  ' No new location needs to be rendered.',
  ' as text-presence only; they need no new portraits',
  ' Captions identify both directions.',
  '; these roles can appear as text and off-camera voices',
  'Readable evidence card, not a magical reveal: ',
  ' No real Taíno symbol is fabricated to explain it.',
  " A hand's result does not grant rights or decide consequences.",
  ' No instant conviction or magical disappearance.',
  '; no mysterious voice on demand',
  ' Keep it warm, brief, and unhurried.',
  ' Cut to title, then credits.',
  ' No compulsory sequel chapter.',
];

/** The caption text a player sees for a direction block, or null for a silent beat. */
export function playerCaption(raw: string): string | null {
  if (NOTE_BLOCKS.includes(raw)) return null;
  let s = raw;
  for (const f of OMIT) s = s.split(f).join('');
  return s.startsWith('[') && s.endsWith(']') ? s.slice(1, -1) : s;
}
