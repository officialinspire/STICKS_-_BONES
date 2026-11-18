import { describe, expect, it } from 'vitest';
import { COUSINS_HOUSE_RULES_V1 } from '../engine/rules/presets';
import { rulesItems } from './rules-summary';

describe('rules summary is generated from preset data', () => {
  it('states each mode’s distinguishing rules', () => {
    const { draw2, block2, partnership4 } = COUSINS_HOUSE_RULES_V1.modes;
    expect(rulesItems(draw2).join(' ')).toMatch(/boneyard.*Draw until you can/);
    expect(rulesItems(block2).join(' ')).toMatch(/set aside.*Knock to pass.*minus their own/);
    expect(rulesItems(partnership4).join(' ')).toMatch(/two teams.*6\|6.*team with fewer pips.*200/);
    for (const r of [draw2, block2, partnership4]) expect(rulesItems(r)).toHaveLength(8);
  });
});
