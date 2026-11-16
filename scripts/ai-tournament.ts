/**
 * npm run ai:tournament — mirrored seeded duels between difficulties in every
 * mode (each deal played twice with sides swapped). Prints mean points per
 * hand for the first-named side, plus decision timing.
 */
import { mirroredDuel, driveMatch } from '../src/ai/testing.ts';
import type { Difficulty } from '../src/ai/types.ts';
import type { ModeId } from '../src/engine/types.ts';

const DEALS = Number(process.env.DEALS ?? 30);
const HANDS = Number(process.env.HANDS ?? 4);
const modes: ModeId[] = ['draw2', 'block2', 'partnership4'];
const pairs: [Difficulty, Difficulty][] = [
  ['normal', 'easy'],
  ['hard', 'normal'],
  ['hard', 'easy'],
];
console.log(`Mirrored duels: ${DEALS} deals × ${HANDS} hands × 2 seatings. Value = mean points per hand for the first side.\n`);
console.log(['mode', ...pairs.map(([a, b]) => `${a} vs ${b}`)].join(' | '));
for (const mode of modes) {
  const row = pairs.map(([a, b]) => mirroredDuel(mode, a, b, DEALS, HANDS, `tour-${mode}-${a}-${b}`).toFixed(2));
  console.log([mode, ...row].join(' | '));
}
for (const mode of modes) {
  let worst = 0;
  let total = 0;
  let n = 0;
  const { decide } = await import('../src/ai/policy.ts');
  driveMatch({
    mode,
    dealSeed: `timing2-${mode}`,
    aiSeed: 'timing',
    sides: ['normal', 'normal'],
    maxHands: 4,
    onDecision: (p) => {
      if (p.obs.legal.length < 2) return;
      const t0 = performance.now();
      decide('hard', p.obs, p.rng);
      const ms = performance.now() - t0;
      worst = Math.max(worst, ms);
      total += ms;
      n++;
    },
  });
  console.log(`hard decision time (${mode}, inline): mean ${(total / Math.max(1, n)).toFixed(1)} ms, worst ${worst.toFixed(1)} ms`);
}
