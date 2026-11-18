import { describe, expect, it } from 'vitest';
import { deal } from './deal';
import { seedRng } from './rng';
import { checkPresetConsistency, COUSINS_HOUSE_RULES_V1, getRulesPreset, RULES_PRESETS } from './rules/presets';
import { nextSeat, tablePosition, teamOf } from './seats';
import { CANONICAL_TILE_IDS } from './tiles';
import { MODE_IDS } from './types';

describe('rules presets', () => {
  it('every published preset is internally consistent', () => {
    for (const p of Object.values(RULES_PRESETS)) expect(checkPresetConsistency(p)).toEqual([]);
  });

  it('is versioned and looked up by id + version', () => {
    expect(getRulesPreset('cousins-house-rules', 1)).toBe(COUSINS_HOUSE_RULES_V1);
    expect(getRulesPreset('cousins-house-rules', 2)).toBeNull();
    expect(COUSINS_HOUSE_RULES_V1.name).toBe("Cousin's House Rules");
  });

  it('encodes the product defaults', () => {
    const { draw2, block2, partnership4 } = COUSINS_HOUSE_RULES_V1.modes;
    expect(COUSINS_HOUSE_RULES_V1.shared.doubles).toEqual({ orientation: 'crosswise', spinner: false });
    expect([draw2.stock, block2.stock, partnership4.stock]).toEqual([
      { kind: 'boneyard', size: 14 },
      { kind: 'unused', size: 14 },
      { kind: 'none', size: 0 },
    ]);
    expect([draw2.target.default, block2.target.default, partnership4.target.default]).toEqual([100, 100, 200]);
    expect(partnership4.teams).toEqual([
      [0, 2],
      [1, 3],
    ]);
    expect(block2.scoring.blockWin).toBe('opponent-minus-own-pips');
    expect(draw2.scoring.blockWin).toBe('all-remaining-hand-pips');
    expect(partnership4.opening.firstHand.kind).toBe('double-six-holder');
    for (const m of MODE_IDS) expect(COUSINS_HOUSE_RULES_V1.modes[m].scoring.bonuses).toEqual([]);
  });

  it('detects inconsistent presets', () => {
    const broken = structuredClone(COUSINS_HOUSE_RULES_V1) as unknown as {
      modes: { draw2: { tilesPerSeat: number; target: { default: number } } };
    };
    broken.modes.draw2.tilesPerSeat = 8;
    broken.modes.draw2.target.default = 150;
    const problems = checkPresetConsistency(broken as never);
    expect(problems.length).toBe(2);
  });
});

describe('seats', () => {
  const { draw2, partnership4 } = COUSINS_HOUSE_RULES_V1.modes;
  it('turn order is next = seat + 1 (counterclockwise)', () => {
    expect([0, 1, 2, 3].map((s) => nextSeat(partnership4, s as 0))).toEqual([1, 2, 3, 0]);
    expect([0, 1].map((s) => nextSeat(draw2, s as 0))).toEqual([1, 0]);
  });
  it('partners sit opposite', () => {
    expect(teamOf(partnership4, 0)).toBe(teamOf(partnership4, 2));
    expect(teamOf(partnership4, 1)).toBe(teamOf(partnership4, 3));
    expect(teamOf(partnership4, 0)).not.toBe(teamOf(partnership4, 1));
    expect([0, 1, 2, 3].map((s) => tablePosition(4, s as 0))).toEqual(['bottom', 'right', 'top', 'left']);
  });
});

describe('deal', () => {
  it('partitions all 28 tiles for every mode', () => {
    for (const m of MODE_IDS) {
      const rules = COUSINS_HOUSE_RULES_V1.modes[m];
      const d = deal(rules, seedRng(`deal-${m}`));
      expect(d.hands).toHaveLength(rules.seatCount);
      for (const h of d.hands) expect(h).toHaveLength(7);
      expect(d.stock).toHaveLength(rules.stock.size);
      expect([...d.hands.flat(), ...d.stock].sort()).toEqual([...CANONICAL_TILE_IDS].sort());
    }
  });
  it('is reproducible from the same seed', () => {
    const r = COUSINS_HOUSE_RULES_V1.modes.draw2;
    expect(deal(r, seedRng(99))).toEqual(deal(r, seedRng(99)));
  });
});
