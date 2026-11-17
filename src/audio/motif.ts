/** Pure data (no globs), so Node scripts and tests can import it too. */
/**
 * The supernatural motif: THREE measured knocks from one recording, evenly spaced, then a
 * FOURTH answering from beyond (same hit, filtered and given distance). Exact and repeatable,
 * and nothing like the fake speaker (which is a voice recording — not supplied; caption only).
 */
export const MOTIF = {
  knocks: ['motif-knock-1', 'motif-knock-2', 'motif-knock-3'] as const,
  beyond: 'motif-knock-beyond',
  /** Seconds between the three knocks. */
  interval: 0.62,
  /** Pause after the third knock before the fourth answers. */
  answerGap: 1.15,
} as const;
