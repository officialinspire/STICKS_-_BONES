import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrast, CSS_VAR, FORBIDDEN_TEXT, MIN, PAIRINGS, PALETTE, pairingRatio, rgb, scrimRatio, SCRIMS, type Token } from './tokens';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

describe('design tokens', () => {
  it('styles.css declares exactly the palette', () => {
    for (const [token, hex] of Object.entries(PALETTE)) {
      expect(css).toMatch(new RegExp(`${CSS_VAR[token as Token]}:\\s*${hex}`, 'i'));
    }
  });

  it.each(PAIRINGS.map((p) => [`${p.fg} on ${p.bg}${p.alpha ? ` @${p.alpha}` : ''} (${p.need}) — ${p.use}`, p] as const))('%s meets its threshold', (_label, p) => {
    expect(pairingRatio(p)).toBeGreaterThanOrEqual(MIN[p.need]);
  });

  it('forbidden text pairings really are below 3:1 (so they stay forbidden)', () => {
    for (const [a, b] of FORBIDDEN_TEXT) expect(contrast(rgb(PALETTE[a]), rgb(PALETTE[b]))).toBeLessThan(3);
  });

  it('scrims keep text readable over the worst possible backdrop pixel', () => {
    for (const s of SCRIMS) expect(scrimRatio(s), s.use).toBeGreaterThanOrEqual(4.5);
  });

  it('records the measured ratios (for docs/DESIGN.md)', () => {
    const table = PAIRINGS.map((p) => `${p.fg}/${p.bg}${p.alpha ? `@${p.alpha}` : ''}: ${pairingRatio(p).toFixed(2)}`);
    expect(table.length).toBe(PAIRINGS.length);
  });
});
