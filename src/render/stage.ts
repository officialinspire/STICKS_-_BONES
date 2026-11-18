/**
 * Stable "stage" boxes for character and effect sprites.
 *
 * Every frame of a sheet is shown through a viewBox of the SAME size, anchored
 * at the frame's bottom-centre (feet), so swapping expressions or animation
 * frames never changes the character's scale or footing. Each stage box is
 * guaranteed to (a) contain the whole content rect — the hat is never cropped
 * — and (b) stay inside the frame's own cell, so no neighbouring frame can
 * show. Where a cell is tight, the box is shifted inside it (anchor drift is
 * reported and tested). Rendering uses `preserveAspectRatio="… meet"`, so art
 * is never distorted.
 */
import type { ImageAsset, Rect, SpriteFrame } from '../assets/types';

export interface StageBox extends Rect {
  /** Horizontal distance between the stage centre and the frame's true anchor. */
  readonly drift: number;
}

export interface SheetStage {
  readonly w: number;
  readonly h: number;
  readonly pad: number;
  readonly boxes: Readonly<Record<string, StageBox>>;
}

function place(f: SpriteFrame, w: number, h: number, pad: number): StageBox | null {
  const { rect: r, cell: c } = f;
  const ax = r.x + r.w / 2;
  const lo = Math.max(c.x, r.x + r.w - w);
  const hi = Math.min(c.x + c.w - w, r.x);
  if (lo > hi) return null;
  const x = Math.min(hi, Math.max(lo, ax - w / 2));
  const bottom = Math.min(c.y + c.h, r.y + r.h + pad);
  const y = bottom - h;
  if (y < c.y || y > r.y) return null;
  return { x, y, w, h, drift: Math.abs(x + w / 2 - ax) };
}

/** Compute the shared stage for a sheet's frames (largest padding ≤ 6px that fits every cell). */
export function sheetStage(frames: readonly SpriteFrame[]): SheetStage {
  const maxW = Math.max(...frames.map((f) => f.rect.w));
  const maxH = Math.max(...frames.map((f) => f.rect.h));
  for (let pad = 6; pad >= 0; pad--) {
    const w = maxW + 2 * pad;
    const h = maxH + 2 * pad;
    const boxes: Record<string, StageBox> = {};
    let ok = true;
    for (const f of frames) {
      const b = place(f, w, h, pad);
      if (!b) {
        ok = false;
        break;
      }
      boxes[f.id] = b;
    }
    if (ok) return { w, h, pad, boxes };
  }
  throw new Error('sheetStage: frames cannot share a stage inside their cells');
}

/**
 * Compact "bust" crop: the top of the stage (hat included) with the given
 * aspect (height / width). Same anchor for every frame, so expressions swap in place.
 */
export function bustBox(stage: SheetStage, frameId: string, aspect = 1.05): Rect {
  const b = stage.boxes[frameId];
  if (!b) throw new Error(`no stage for ${frameId}`);
  return { x: b.x, y: b.y, w: b.w, h: Math.min(b.h, b.w * aspect) };
}

const cache = new Map<string, SheetStage>();
export function stageFor(asset: ImageAsset): SheetStage {
  let s = cache.get(asset.id);
  if (!s) {
    s = sheetStage(asset.frames ?? []);
    cache.set(asset.id, s);
  }
  return s;
}

/** Square box around an effect frame's content, kept inside its cell. */
export function effectBox(f: SpriteFrame): Rect {
  const side = Math.min(Math.max(f.rect.w, f.rect.h) + 8, f.cell.w, f.cell.h);
  const cx = f.rect.x + f.rect.w / 2;
  const cy = f.rect.y + f.rect.h / 2;
  const x = Math.min(f.cell.x + f.cell.w - side, Math.max(f.cell.x, cx - side / 2));
  const y = Math.min(f.cell.y + f.cell.h - side, Math.max(f.cell.y, cy - side / 2));
  return { x, y, w: side, h: side };
}
