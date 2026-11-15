import { describe, expect, it } from 'vitest';
import { PIPS } from '../engine/types';
import { dominoSvg, PIP_LAYOUT } from './domino';

describe('fallback domino rendering', () => {
  it('pip layout has exactly n pips for value n, all inside the half', () => {
    for (const p of PIPS) {
      expect(PIP_LAYOUT[p]).toHaveLength(p);
      for (const [x, y] of PIP_LAYOUT[p]) {
        expect(x).toBeGreaterThan(10);
        expect(x).toBeLessThan(90);
        expect(y).toBeGreaterThan(10);
        expect(y).toBeLessThan(90);
      }
    }
  });

  it('renders valid pips with no art at all', () => {
    for (const a of PIPS)
      for (const b of PIPS) {
        const svg = dominoSvg(a, b);
        expect(svg.match(/<circle /g)?.length ?? 0).toBe(a + b);
        expect(svg).not.toContain('<image');
      }
  });

  it('decorative tiles are hidden from assistive tech; labelled tiles are not', () => {
    expect(dominoSvg(6, 6)).toContain('aria-hidden="true"');
    expect(dominoSvg(6, 4, { label: 'Domino six–four' })).toContain('aria-label="Domino six–four"');
  });

  it('escapes sprite URLs', () => {
    const svg = dominoSvg(1, 2, { face: { url: 'a"b<c', sheetWidth: 10, sheetHeight: 10, rect: { x: 0, y: 0, w: 5, h: 10 } } });
    expect(svg).toContain('a&quot;b&lt;c');
  });
});
