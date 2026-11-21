/**
 * Developer-only layout fixtures (loaded via dynamic import from the dev
 * panel; never part of normal play). Each is a valid, invariant-checked state.
 */
import { chain, complement, craft } from '../engine/testing/craft';
import type { MatchState } from '../engine/state';

export type FixtureId = 'max-board' | 'max-hand' | 'draw-hand' | 'both-ends' | 'match-point' | 'match-point-solo';

export const FIXTURES: Record<FixtureId, { label: string; build: () => MatchState; opponent?: 'ai' }> = {
  'max-board': {
    label: 'Max board: 26 on the table, 6|6 fits both ends (27 after playing)',
    build: () => {
      const hands = [['t66'], ['t55']];
      return craft({ mode: 'draw2', humanSeats: [0, 1], hands, line: chain(complement(...hands), 6), stock: [], turn: 0, opener: 1 });
    },
  },
  'max-hand': {
    label: 'Max hand: 21 tiles in a Draw hand',
    build: () => {
      const line: [string, number, number][] = [
        ['t00', 0, 0],
        ['t10', 0, 1],
        ['t11', 1, 1],
        ['t21', 1, 2],
        ['t22', 2, 2],
        ['t20', 2, 0],
      ];
      const opp = ['t30'];
      const mine = complement(line.map((l) => l[0]), opp);
      return craft({ mode: 'draw2', humanSeats: [0, 1], hands: [mine, opp], line, stock: [], turn: 0, opener: 1 });
    },
  },
  'draw-hand': {
    label: 'Long draw: 14 tiles, nothing fits the 6s, boneyard of 10 (keep drawing)',
    build: () => {
      // The 6|6 on the table; every other 6 is in the boneyard, so the player draws until one comes up.
      const sixes = ['t61', 't62', 't63', 't64', 't65', 't60'];
      const others = complement(['t66', ...sixes]); // the 21 tiles without a 6
      const mine = others.slice(0, 14);
      const opp = others.slice(14, 17);
      const stock = [...others.slice(17), ...sixes];
      return craft({ mode: 'draw2', humanSeats: [0, 1], hands: [mine, opp], line: [['t66', 6, 6]], stock, turn: 0, opener: 1 });
    },
  },
  'match-point': {
    label: 'Match point: Player 1 at 95, one tile from going out',
    build: () =>
      craft({ mode: 'draw2', humanSeats: [0, 1], hands: [['t61'], ['t55', 't44', 't20']], line: [['t66', 6, 6]], turn: 0, opener: 1, scores: [95, 0] }),
  },
  'match-point-solo': {
    label: 'Match point vs Cousin: you at 95 (draw2 solo, counts in statistics)',
    opponent: 'ai',
    build: () => craft({ mode: 'draw2', hands: [['t61'], ['t55', 't44', 't20']], line: [['t66', 6, 6]], turn: 0, opener: 1, scores: [95, 0] }),
  },
  'both-ends': {
    label: 'Both ends: 5|3 fits ends 3 and 5',
    build: () => {
      const hands = [['t53', 't66', 't44', 't22', 't11', 't00'], ['t65', 't64', 't62', 't61', 't60', 't54', 't52']];
      const line: [string, number, number][] = [
        ['t31', 3, 1],
        ['t51', 1, 5],
      ];
      return craft({ mode: 'draw2', humanSeats: [0, 1], hands, line, turn: 0, opener: 1 });
    },
  },
};
