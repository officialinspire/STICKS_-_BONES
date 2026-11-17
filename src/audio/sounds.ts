/**
 * The local sound bank: which decoded sample(s) each sound uses, the authored
 * knock motif, and the ambience beds. Files and their provenance (source,
 * creator, CC0 license, edits, hashes) are in src/assets/sound-manifest.json,
 * built by scripts/build-audio.py and checked by `npm run assets:verify`. URLs come from globs, so a missing file
 * resolves to nothing and the manager falls back (synth placeholder or silence).
 *
 * Nothing here is "final" unless the manifest says so: tile sounds are
 * stand-ins (Kenney casino chips/cards) until a real double-six set is recorded.
 */
const sfxFiles = import.meta.glob('../../assets/audio/sfx/*.wav', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const bedFiles = import.meta.glob('../../assets/audio/ambience/*.mp3', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

export type BedId = 'amb-patio' | 'amb-promenade' | 'amb-jungle' | 'amb-cave' | 'amb-terrace';

export function sampleUrl(id: string): string | null {
  return sfxFiles[`../../assets/audio/sfx/${id}.wav`] ?? null;
}
export function bedUrl(id: BedId): string | null {
  return bedFiles[`../../assets/audio/ambience/${id}.mp3`] ?? null;
}

/** Matched variations per sound (the manager never repeats the same variant twice in a row). */
export const VARIANTS = {
  select: ['ui-select-1', 'ui-select-2'],
  back: ['ui-back-1', 'ui-back-2'],
  confirm: ['ui-confirm-1', 'ui-confirm-2'],
  invalid: ['ui-invalid-1'],
  pickup: ['tile-pickup-1', 'tile-pickup-2', 'tile-pickup-3'],
  slide: ['tile-slide-1', 'tile-slide-2', 'tile-slide-3'],
  place: ['tile-place-1', 'tile-place-2', 'tile-place-3'],
  slam: ['tile-slap-1', 'tile-slap-2'],
  shuffle: ['tile-shuffle-1'],
  draw: ['tile-draw-1', 'tile-draw-2'],
  knock: ['pass-knock-1', 'pass-knock-2'],
  tap: ['ui-select-1'],
} as const;

export { MOTIF } from './motif';

/** Every sample present in the build; the manifest stays out of the bundle. */
export const ALL_SAMPLES: readonly string[] = Object.keys(sfxFiles).map((k) => k.slice(k.lastIndexOf('/') + 1, -4));

/**
 * Samples are decoded per need, not all at the first gesture: UI sounds with the menu, table sounds
 * when a table opens, story accents when Story plays. (Each file is fetched and decoded once.)
 */
export function samplesFor(group: 'ui' | 'table' | 'story'): string[] {
  const re = group === 'ui' ? /^ui-/ : group === 'table' ? /^(tile-|pass-knock-)/ : /^(motif-|water-|glass-)/;
  return ALL_SAMPLES.filter((id) => re.test(id));
}
