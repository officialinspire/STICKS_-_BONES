/**
 * Pacing hooks for playtests: standard `performance` marks and measures, nothing stored or sent.
 * Measures are named `story:<scene>:<phase>` (phase = pre | hand | post); a facilitator reads them in the
 * browser console (docs/PLAYTEST.md). Time spent in a hidden tab is included; note it on the sheet.
 */
export type Phase = 'pre' | 'hand' | 'post';
const open = new Set<string>();

export function phaseStart(scene: string, phase: Phase): void {
  const k = `story:${scene}:${phase}`;
  open.add(k);
  try {
    performance.mark(`${k}:start`);
  } catch {
    /* no Performance API */
  }
}

export function phaseEnd(scene: string, phase: Phase): void {
  const k = `story:${scene}:${phase}`;
  if (!open.delete(k)) return; // a resume mid-phase measures from the resume, never twice
  try {
    performance.measure(k, `${k}:start`);
  } catch {
    /* mark cleared or no Performance API */
  }
}
