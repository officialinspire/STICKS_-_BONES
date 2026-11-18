/**
 * URLs for audio/video supplied by the owner. Globs (not literal imports) so a
 * file that is absent simply resolves to nothing — the build never breaks and
 * the game falls back gracefully. Files are fetched only when first needed.
 */
import { MUSIC, type MusicTrack } from './audio-manifest';

const music = import.meta.glob('../../assets/audio/music/*.mp3', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const video = import.meta.glob('../../assets/video/inspiresoftwareintro.mp4', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

export function musicUrl(id: MusicTrack['id']): string | null {
  const t = MUSIC.find((m) => m.id === id);
  return t ? (music[`../../${t.path}`] ?? null) : null;
}

export function introVideoUrl(): string | null {
  return video['../../assets/video/inspiresoftwareintro.mp4'] ?? null;
}
