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
  it('four sheets, eight uniform baseline-aligned frames each, default e1, no expression meanings claimed', () => {
    expect(cast.cast.map((c) => c.who).sort()).toEqual(['luz', 'marisol', 'rafa', 'vale']);
    for (const c of cast.cast) {
      expect(c.frames).toHaveLength(8);
      expect(new Set(c.frames.map((f) => `${f.w}x${f.h}/${f.anchorX}/${f.baselineY}`)).size).toBe(1);
      expect(c.defaultFrame).toBe('e1');
      expect(c.expressionLabels).toMatch(/not supplied/);
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
