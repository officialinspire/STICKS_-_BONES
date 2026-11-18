import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COUSINS_HOUSE_RULES_V1 } from '../engine/rules/presets';
import { EXCLUDED_BONUSES, HELP_SECTIONS } from './help';

const RULES = readFileSync(fileURLToPath(new URL('../../docs/RULES.md', import.meta.url)), 'utf8');
const text = HELP_SECTIONS.flatMap((s) => [s.title, ...s.points]).join(' ');

describe('help screen follows RULES.md', () => {
  it('covers opening, drawing/passing, blocked scoring, turn direction and bonus exclusions', () => {
    for (const id of ['opening', 'stuck', 'scoring', 'direction', 'bonuses']) expect(HELP_SECTIONS.map((s) => s.id)).toContain(id);
  });

  it('lists exactly the bonuses RULES.md excludes', () => {
    expect(RULES).toMatch(/No capicú, chuchazo, forced-pass bonus, or forced redeal/);
    for (const b of EXCLUDED_BONUSES) expect(RULES).toContain(b);
    for (const b of EXCLUDED_BONUSES) expect(text).toContain(b);
    expect(COUSINS_HOUSE_RULES_V1.modes.draw2.scoring.bonuses).toEqual([]);
  });

  it('agrees with RULES.md and the presets on key facts', () => {
    expect(RULES).toMatch(/counterclockwise/);
    expect(text).toMatch(/counterclockwise/);
    expect(RULES).toMatch(/Never spinners/);
    expect(text).toMatch(/never spinners/);
    expect(RULES).toMatch(/draw one tile at a time until you draw a playable tile/);
    expect(text).toMatch(/draw one tile at a time until you get one that plays/);
    expect(RULES).toMatch(/opponent pips minus own pips/);
    expect(text).toMatch(/opponent’s pips minus your own/);
    expect(RULES).toMatch(/ties by higher end/);
    expect(text).toMatch(/ties go to the higher end/);
    const { draw2, block2, partnership4 } = COUSINS_HOUSE_RULES_V1.modes;
    expect([draw2.target.default, block2.target.default, partnership4.target.default]).toEqual([100, 100, 200]);
    expect(text).toMatch(/Draw and Block play to 100, Partnership to 200/);
    expect(partnership4.opening.firstHand.kind).toBe('double-six-holder');
    expect(text).toMatch(/whoever holds 6\|6 leads it/);
  });
});
