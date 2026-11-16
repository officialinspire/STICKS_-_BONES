/**
 * Audio manifest. Only owner-approved files are listed (uploaded by the owner
 * to the repository, artist tag "officialinspire"). Numbers were measured with
 * ffprobe/ffmpeg ebur128 and `scripts/audio-audit.py` on 2026-11-16;
 * `npm run assets:verify` checks bytes and SHA-256.
 *
 * Loop policy: both tracks are complete songs with composed endings. Automatic
 * analysis found NO proven seamless loop (end→start seams sit at the 92nd and
 * 99.9th percentile of each track's own spectral change; the best internal
 * candidates at the 79th and 94th). Nobody has auditioned a loop by ear, so
 * runtime does NOT use loop points: a track plays through its ending, then
 * restarts after a short breath. Candidates are recorded, unverified, for the
 * owner to audition on /dev/audio-audition.html.
 */

export interface LoopCandidate {
  readonly start: number;
  readonly end: number;
  readonly similarity: number;
  /** Percentile of the track's own spectral change that the seam exceeds (lower is smoother). */
  readonly seamPercentile: number;
  /** Set true only after a person auditions the seam and approves it. */
  readonly auditioned: boolean;
}

export interface MusicTrack {
  readonly id: 'menu' | 'gameplay';
  readonly title: string;
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly durationSec: number;
  readonly sampleRate: number;
  readonly channels: number;
  readonly integratedLufs: number;
  /** Gain applied at runtime so both tracks sit near TARGET_LUFS. */
  readonly gainDb: number;
  readonly leadSilenceSec: number;
  readonly trailSilenceSec: number;
  readonly ending: 'fade-out' | 'hard-stop';
  readonly loop: { readonly mode: 'restart-after-ending'; readonly gapSec: number; readonly candidates: readonly LoopCandidate[] };
  readonly notes: string;
}

export const TARGET_LUFS = -20;

export const MUSIC: readonly MusicTrack[] = [
  {
    id: 'menu',
    title: 'Patio Dominoes (Take 2)',
    path: 'assets/audio/music/Patio Dominoes (Take 2).mp3',
    bytes: 3360675,
    sha256: 'b4789c27b7d99ede92c5b762365b984c4fad86744527f42e953aac85f02f74f8',
    durationSec: 155.81,
    sampleRate: 48000,
    channels: 2,
    integratedLufs: -17.3,
    gainDb: -2.7,
    leadSilenceSec: 0.18,
    trailSilenceSec: 2.6,
    ending: 'hard-stop',
    loop: { mode: 'restart-after-ending', gapSec: 0.8, candidates: [{ start: 54.75, end: 115.31, similarity: 0.996, seamPercentile: 94.3, auditioned: false }] },
    notes: 'Steady groove (LRA 1.1 LU). Used for menus and results. Embedded cover art (1408×768 JPEG) inflates the file; a stripped derivative is a future size win.',
  },
  {
    id: 'gameplay',
    title: 'Domino Table (Subtle Vibe)',
    path: 'assets/audio/music/Domino Table (Subtle Vibe).mp3',
    bytes: 4147052,
    sha256: '19ec7e80026246f8c1b88d5942a3e579a934a2ba01a40e18b174249f93ea4e6d',
    durationSec: 179.78,
    sampleRate: 48000,
    channels: 2,
    integratedLufs: -19.4,
    gainDb: -0.6,
    leadSilenceSec: 0.03,
    trailSilenceSec: 2.18,
    ending: 'fade-out',
    loop: { mode: 'restart-after-ending', gapSec: 0.6, candidates: [{ start: 45.46, end: 119.54, similarity: 0.997, seamPercentile: 78.7, auditioned: false }] },
    notes: 'Quieter, more dynamic (LRA 6.6 LU) — sits under play. Fades out over ~8 s, so a restart sounds like the song beginning again.',
  },
];

/** Intro video: used only if the owner supplies this exact file. */
export const INTRO_VIDEO_PATH = 'assets/video/inspiresoftwareintro.mp4';

/**
 * Sound effects and ambience: NO files have been supplied. The game uses small
 * code-synthesized PLACEHOLDER sounds (src/audio/synth.ts), clearly marked as
 * such; they are not final audio. Spoken voice: none supplied — Cousin speaks
 * through subtitles and expressions only.
 */
export const PLACEHOLDER_AUDIO = { sfx: true, ambience: true, voice: false } as const;
