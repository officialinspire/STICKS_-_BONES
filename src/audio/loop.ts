/**
 * Loop points for a decoded ambience bed. The beds are authored as seamless loops (the tail is
 * cross-faded into the head by scripts/build-audio.py), but an MP3 decoder may add encoder
 * priming at the start and padding at the end. Those are digital near-silence; a looping
 * buffer source must skip them or every wrap produces a tiny dropout.
 *
 * Pure (no Web Audio types) so it can be unit-tested and reused by the audition page.
 */
export interface LoopBounds {
  /** First and one-past-last sample of the loop. */
  readonly start: number;
  readonly end: number;
}

/**
 * Trim leading/trailing runs of near-silence, scanning at most `maxScan` samples at each edge
 * (real ambience never sits at digital silence for that long; a quiet passage deeper in is kept).
 */
export function loopBounds(channels: readonly Float32Array[], maxScan: number, threshold = 1e-4): LoopBounds {
  const len = channels[0]?.length ?? 0;
  const loud = (i: number) => channels.some((c) => Math.abs(c[i]!) > threshold);
  let start = 0;
  const scan = Math.min(maxScan, Math.floor(len / 4));
  while (start < scan && !loud(start)) start++;
  if (start >= scan) start = 0; // nothing loud near the head: keep the file as authored
  let end = len;
  while (end > len - scan && !loud(end - 1)) end--;
  if (end <= len - scan) end = len;
  return { start, end: Math.max(start + 1, end) };
}

/** Largest sample-to-sample jump across the wrap (end-1 → start) relative to the bed's typical step. */
export function seamJump(channels: readonly Float32Array[], b: LoopBounds): number {
  let typical = 0;
  let n = 0;
  let jump = 0;
  for (const c of channels) {
    for (let i = b.start + 1; i < b.end; i += 7) {
      typical += Math.abs(c[i]! - c[i - 1]!);
      n++;
    }
    jump = Math.max(jump, Math.abs(c[b.start]! - c[b.end - 1]!));
  }
  const mean = n ? typical / n : 0;
  return mean > 0 ? jump / mean : 0;
}
