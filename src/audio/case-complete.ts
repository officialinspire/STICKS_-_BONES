/**
 * The case-complete cue (docs/MUSIC_BRIEFS.md: 6–10 s, a warm, settled resolution for the epilogue's end) and its
 * optional foley, played once at the title reprise by AudioManager.caseComplete().
 *
 * Both files are OPTIONAL owner deliverables built by scripts/build-owner-audio.py into assets/audio/cues/
 * (`case-complete.mp3` on the music bus, `case-complete-foley.mp3` on the SFX bus). Until they are supplied, the
 * sample globs resolve nothing and the reprise keeps the epilogue's patio track and bed: an honest fallback, never
 * a synthesized stand-in.
 *
 * Loop points are explicit data only. A cue plays once through its natural tail unless its entry here carries
 * points that a person has auditioned (`auditioned: true`); nobody may set that without a listening pass.
 */
export const CASE_COMPLETE_SAMPLE = 'case-complete';
export const CASE_COMPLETE_FOLEY = 'case-complete-foley';

export interface CueLoop {
  /** Seconds into the decoded cue. */
  readonly start: number;
  readonly end: number;
  /** True only after a person has listened to the seam and approved it. */
  readonly auditioned: boolean;
}

/** Recorded loop points per cue id (mirrors src/assets/owner-audio.json `cues[].loop`; a test keeps them equal). */
export const CUE_LOOPS: Readonly<Record<string, CueLoop>> = {};

/** The loop a cue may use at runtime: auditioned, well-formed points only; otherwise play once. */
export function runtimeLoop(id: string, loops: Readonly<Record<string, CueLoop>> = CUE_LOOPS): { start: number; end: number } | null {
  const l = loops[id];
  if (!l || !l.auditioned || !(l.start >= 0) || !(l.end > l.start + 0.25)) return null;
  return { start: l.start, end: l.end };
}
