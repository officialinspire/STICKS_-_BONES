import { describe, expect, it } from 'vitest';
import derivatives from './derivatives.json';
import cast from './cast.json';
import { envKey, envPosition } from './env';
import { ENV_FOCUS, ENV_IDS, portraitCrop } from './focal';
import { STAGING } from '../story/staging';
import { PORTRAIT_URLS } from './urls';

describe('environment focal points and portrait crops', () => {
  it('staging uses exactly the focal table for every environment (opening backdrop and cues)', () => {
    for (const st of Object.values(STAGING)) {
      if (st.env) expect(st.focus).toBe(envPosition(st.env));
      for (const c of st.cues) for (const k of c.cues) if (k.kind === 'backdrop' && k.env) expect(k.focus).toBe(envPosition(k.env));
    }
  });
  it('every environment has a 3:4 crop centred on its focal point (clamped inside the image)', () => {
    for (const env of ENV_IDS) {
      const d = derivatives.portrait.find((p) => p.of === env)!;
      expect(d.crop).toEqual(portraitCrop(1672, 941, ENV_FOCUS[env].x));
      expect(d.crop.w / d.crop.h).toBeCloseTo(0.75, 2);
      expect(`${env}@portrait` in PORTRAIT_URLS).toBe(true);
      // The focal point inside the crop is what the CSS position says.
      expect(envPosition(`${env}@portrait`)).toBe(`${+(d.focus.x * 100).toFixed(2)}% ${+(ENV_FOCUS[env].y * 100).toFixed(2)}%`);
      expect(d.bytes).toBeLessThan(derivatives.derivatives.find((x) => x.id === env)!.bytes);
    }
  });
  it('portrait viewports get the crop; landscape and non-environment ids pass through', () => {
    expect(envKey('env.back-alley', true)).toBe('env.back-alley@portrait');
    expect(envKey('env.back-alley', false)).toBe('env.back-alley');
    expect(envKey('tile.atlas', true)).toBe('tile.atlas');
  });
});

describe('cast derivatives', () => {
  it('four sheets, eight uniform baseline-aligned frames each, default e1, verified meanings recorded', () => {
    expect(cast.cast.map((c) => c.who).sort()).toEqual(['luz', 'marisol', 'rafa', 'vale']);
    for (const c of cast.cast) {
      expect(c.frames).toHaveLength(8);
      expect(new Set(c.frames.map((f) => `${f.w}x${f.h}/${f.anchorX}/${f.baselineY}`)).size).toBe(1);
      expect(c.defaultFrame).toBe('e1');
      expect(c.expressionLabels).toMatch(/verified by visual inspection/);
      for (const f of c.frames) expect(f.meaning.length, `${c.who} ${f.id}`).toBeGreaterThan(4);
      expect(c.alphaExact).toBe(true);
      expect(c.repairs.fringePixelsAfter).toBe(0);
    }
  });
});

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
describe('manifest prose is stripped from the bundle (vite stripManifestProse)', () => {
  it('no runtime source reads proposedUse or originalName', () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.ts$/.test(f) && !/\.test\.ts$/.test(f) && !/assets[\\/](manifest|types)\.ts$/.test(p)) files.push(p);
      }
    };
    walk(join(__dirname, '..'));
    const users = files.filter((f) => /\b(proposedUse|originalName)\b/.test(readFileSync(f, 'utf8')));
    expect(users).toEqual([]);
  });
});

import { castFace, castFrame } from '../ui/story-assets';
describe('cast dialogue crops (visible bounds)', () => {
  it('every sheet crops to its visible figure: same crop for every frame, inside the cell, upright aspect', () => {
    for (const c of cast.cast) {
      const f = castFrame(c.of as 'cast.vale.atlas')!;
      const cell = c.frames[0]!;
      expect(f.w).toBeLessThanOrEqual(cell.w);
      expect(f.h).toBeLessThanOrEqual(cell.h);
      expect(f.h).toBeGreaterThan(f.w * 0.95); // head-and-shoulders, not a sliver
      // The visible crop trims the padding: it starts at the highest head top of any frame (minus a hair
      // margin) and ends at the baseline. Every frame gets the same offsets, so an expression change can
      // never move or rescale the figure.
      const head = Math.min(...c.frames.map((x) => x.headTopY));
      expect(f.y - cell.y).toBe(Math.max(0, head - 6));
      for (const fr of c.frames) {
        const g = castFrame(c.of as 'cast.vale.atlas', fr.id)!;
        expect([g.w, g.h, g.x - fr.x, g.y - fr.y]).toEqual([f.w, f.h, f.x - cell.x, f.y - cell.y]);
        expect(g.y + g.h).toBeLessThanOrEqual(fr.y + fr.h);
      }
      const face = castFace(c.of as 'cast.vale.atlas')!;
      expect(face.w).toBe(face.h);
      expect(face.x).toBeGreaterThanOrEqual(cell.x);
      expect(face.x + face.w).toBeLessThanOrEqual(cell.x + cell.w);
    }
  });
});
