/**
 * Per-scene audio profiles for NO REST FOR COUSIN. Each story scene names the ONE music track
 * it may use (or none) and its ambience bed, for the dialogue and for its hand. The manager
 * applies them; nothing else plays music or beds.
 *
 * Mix intent (docs/AUDIO.md): the patio is social, the promenade gets space and surf, the jungle
 * is close and humid, the cave leaves room for water and silence, and the terrace is polished
 * and uncomfortable. No scene has constant ominous music. The owner's two scene beds are used
 * where the briefs place them (docs/MUSIC_BRIEFS.md): "Promenade After Dark" for Chapter 4 and
 * "The Lit Threshold" for Chapter 6 until the cut to the entrance rest area (a `music-off` cue);
 * every other supernatural moment runs on ambience and silence.
 */
import type { BedId } from './sounds';
import type { TrackId } from './manager';

export interface SceneProfile {
  /** Music under the dialogue (null = silence + bed). */
  readonly track: TrackId | null;
  /** Level multiplier for that track (1 = the player's music level). */
  readonly duck: number;
  readonly bed: BedId | null;
  /** Bed level under the dialogue (0..1, on top of the player's ambience level). */
  readonly bedLevel: number;
  /** Music and bed while this scene's hand is played. */
  readonly handTrack: TrackId | null;
  readonly handDuck: number;
  readonly handBedLevel: number;
}

export type StoryProfileId = 'prologue' | 'chapter-1' | 'chapter-2' | 'chapter-3' | 'chapter-4' | 'chapter-5' | 'chapter-6' | 'chapter-7' | 'epilogue';

const p = (track: TrackId | null, duck: number, bed: BedId | null, bedLevel: number, handTrack: TrackId | null, handDuck: number, handBedLevel: number): SceneProfile => ({ track, duck, bed, bedLevel, handTrack, handDuck, handBedLevel });

export const PROFILES: Readonly<Record<StoryProfileId, SceneProfile>> = {
  // Dream at the waterfall: no music at all; a very low cave bed so the knocks are the loudest thing.
  prologue: p(null, 0, 'amb-cave', 0.55, null, 0, 0),
  // Neighborhood patio: social. The approved patio track sits low under the talk.
  'chapter-1': p('menu', 0.45, 'amb-patio', 0.8, 'gameplay', 0.6, 0.55),
  // Back-alley table and the phone call: the patio's neighbourhood, quieter, no music under the call.
  'chapter-2': p(null, 0, 'amb-patio', 0.55, 'gameplay', 0.5, 0.4),
  // Resort: polished dining-room murmur; the table track only for the hand.
  'chapter-3': p(null, 0, 'amb-terrace', 0.7, 'gameplay', 0.45, 0.5),
  // Moonlit promenade: the night-investigation bed under the talk, the surf a little lower beneath it; the same
  // track stays (lower) through the hand, so nothing switches between dialogue and table.
  'chapter-4': p('promenade', 0.5, 'amb-promenade', 0.75, 'promenade', 0.35, 0.6),
  // Jungle camp: close and humid; no music.
  'chapter-5': p(null, 0, 'amb-jungle', 0.85, null, 0, 0.6),
  // Cave: the suspense bed, low so the water and the authored knocks stay the loudest sudden events, until the
  // cut to the entrance rest area (`music-off`). The hand is at the rest area: no music, the water bed only.
  'chapter-6': p('threshold', 0.4, 'amb-cave', 0.75, null, 0, 0.5),
  // Corporate terrace: polished, uncomfortable murmur; the table track is thin and low for the hand.
  'chapter-7': p(null, 0, 'amb-terrace', 0.8, 'gameplay', 0.35, 0.6),
  // Home patio after the case: the patio track returns softly.
  epilogue: p('menu', 0.4, 'amb-patio', 0.6, 'gameplay', 0.5, 0.45),
};

/** Quick Play / two-player tables: a low patio bed (only when the player turns ambience on). */
export const QUICK_PLAY_BED: { readonly bed: BedId; readonly level: number } = { bed: 'amb-patio', level: 0.5 };
