import { describe, expect, it } from 'vitest';
import { IMAGE_ASSETS } from '../assets/manifest';
import type { Rect, SpriteFrame } from '../assets/types';
import { bustBox, effectBox, sheetStage } from './stage';

const sheet = (id: string) => IMAGE_ASSETS.find((a) => a.id === id)! as { frames: readonly SpriteFrame[] };
const contains = (outer: Rect, inner: Rect) => outer.x <= inner.x && outer.y <= inner.y && outer.x + outer.w >= inner.x + inner.w && outer.y + outer.h >= inner.y + inner.h;

describe('character stages: stable anchors, no cropping, no neighbours', () => {
  for (const id of ['cousin.atlas.portrait', 'cousin.anim.slam', 'cousin.anim.place']) {
    it(`${id}: one stage size; every box holds the whole figure and stays inside its own cell`, () => {
      const frames = sheet(id).frames;
      const st = sheetStage(frames);
      for (const f of frames) {
        const b = st.boxes[f.id]!;
        expect([b.w, b.h]).toEqual([st.w, st.h]);
        expect(contains(b, f.rect), `${id}/${f.id} crops the figure`).toBe(true);
        expect(contains(f.cell, b), `${id}/${f.id} shows a neighbour`).toBe(true);
        expect(b.drift, `${id}/${f.id} anchor drift`).toBeLessThanOrEqual(6);
        // Feet sit at the same place in every frame (bottom-anchored within the padding).
        expect(b.y + b.h - (f.rect.y + f.rect.h)).toBeLessThanOrEqual(st.pad);
      }
    });
  }

  it('the large atlas cannot be staged cleanly (frames touch neighbours) — which is why it is not used', () => {
    expect(() => sheetStage(sheet('cousin.atlas.large').frames)).toThrow();
  });

  it('bust crops always include the hat and stay in the cell', () => {
    const frames = sheet('cousin.atlas.portrait').frames;
    const st = sheetStage(frames);
    for (const f of frames) {
      const b = bustBox(st, f.id);
      expect(b.y).toBeLessThanOrEqual(f.rect.y); // hat (top of the content) inside
      expect(contains(f.cell, b)).toBe(true);
      expect(b.h).toBeGreaterThan(b.w * 0.9);
    }
  });

  it('effect boxes contain the effect and stay inside their cells', () => {
    for (const f of sheet('fx.sheet').frames) {
      const b = effectBox(f);
      expect(contains(b, f.rect)).toBe(true);
      expect(contains(f.cell, b)).toBe(true);
      expect(b.w).toBe(b.h);
    }
  });
});
