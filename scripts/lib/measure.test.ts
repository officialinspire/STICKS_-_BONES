import { describe, expect, it } from 'vitest';
import { findCuts, measureFrames, type RgbaImage } from './measure';

function image(width: number, height: number, boxes: { x: number; y: number; w: number; h: number }[]): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (const b of boxes)
    for (let y = b.y; y < b.y + b.h; y++)
      for (let x = b.x; x < b.x + b.w; x++) {
        const i = (y * width + x) * 4;
        data.set([200, 100, 50, 255], i);
      }
  return { width, height, data };
}

describe('sprite measurement', () => {
  it('finds unevenly packed frames without assuming equal cells', () => {
    // Three frames of different widths, offsets and heights in a 300×100 sheet.
    const boxes = [
      { x: 5, y: 10, w: 60, h: 80 },
      { x: 110, y: 30, w: 30, h: 40 },
      { x: 205, y: 5, w: 90, h: 90 },
    ];
    const frames = measureFrames(image(300, 100, boxes), { rows: 1, cols: 3, detect: { kind: 'alpha', alphaThreshold: 8 } });
    expect(frames.map((f) => f.rect)).toEqual(boxes);
    expect(frames.every((f) => !f.touchesNeighbor)).toBe(true);
  });

  it('flags frames whose content crosses a cut line', () => {
    const frames = measureFrames(image(200, 50, [{ x: 10, y: 5, w: 120, h: 40 }, { x: 150, y: 5, w: 40, h: 40 }]), {
      rows: 1,
      cols: 2,
      detect: { kind: 'alpha', alphaThreshold: 8 },
    });
    expect(frames.some((f) => f.touchesNeighbor)).toBe(true);
  });

  it('detects content against an opaque background', () => {
    const img = image(100, 50, []);
    for (let i = 0; i < 100 * 50; i++) img.data.set([206, 198, 194, 255], i * 4);
    for (let y = 10; y < 20; y++) for (let x = 60; x < 70; x++) img.data.set([20, 20, 20, 255], (y * 100 + x) * 4);
    const [f] = measureFrames(img, { rows: 1, cols: 1, detect: { kind: 'background', distance: 40 } });
    expect(f!.rect).toEqual({ x: 60, y: 10, w: 10, h: 10 });
  });

  it('cuts at the centre of the widest empty run', () => {
    expect(findCuts([5, 5, 0, 0, 0, 0, 5, 5], 2)).toEqual([{ at: 4, occupancy: 0 }]);
  });

  it('throws on an empty cell', () => {
    expect(() =>
      measureFrames(image(100, 10, [{ x: 0, y: 0, w: 10, h: 10 }]), { rows: 1, cols: 2, detect: { kind: 'alpha', alphaThreshold: 8 } }),
    ).toThrow(/Empty cell/);
  });
});
