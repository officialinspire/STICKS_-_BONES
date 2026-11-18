/**
 * Single source of truth for domino face geometry, shared by the generated
 * raster atlas (scripts/build-atlas.ts) and the runtime SVG fallback, so both
 * draw identical pips.
 *
 * Face space: a portrait tile 100 wide × 200 tall. The top half (y 0–100)
 * shows the tile's HIGH pip, the bottom half (y 100–200) its LOW pip; the id
 * `t64` therefore renders 6 on top and 4 below. Rotation is applied by the
 * renderer, never baked into faces.
 */
import type { Pip, TileId } from '../engine/types';

export const PIP_GEOMETRY_VERSION = 1;
export const FACE_W = 100;
export const FACE_H = 200;
export const HALF = 100;
/** Pip radius in face units. */
export const PIP_RADIUS = 9.5;

/** Pip centres inside one 100×100 half, by value. Symmetric under 180° rotation. */
export const PIP_LAYOUT: Readonly<Record<Pip, readonly (readonly [number, number])[]>> = {
  0: [],
  1: [[50, 50]],
  2: [
    [27, 27],
    [73, 73],
  ],
  3: [
    [27, 27],
    [50, 50],
    [73, 73],
  ],
  4: [
    [27, 27],
    [73, 27],
    [27, 73],
    [73, 73],
  ],
  5: [
    [27, 27],
    [73, 27],
    [50, 50],
    [27, 73],
    [73, 73],
  ],
  6: [
    [27, 24],
    [27, 50],
    [27, 76],
    [73, 24],
    [73, 50],
    [73, 76],
  ],
};

export interface PipDot {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
}

/** All pip dots for a face in face space (high on top). */
export function facePips(high: Pip, low: Pip): PipDot[] {
  return [
    ...PIP_LAYOUT[high].map(([x, y]) => ({ cx: x, cy: y, r: PIP_RADIUS })),
    ...PIP_LAYOUT[low].map(([x, y]) => ({ cx: x, cy: y + HALF, r: PIP_RADIUS })),
  ];
}

export function pipsOfId(id: TileId): { high: Pip; low: Pip } {
  return { high: Number(id[1]) as Pip, low: Number(id[2]) as Pip };
}

/** Screen direction a face's HIGH half points after rotation. */
export type Direction = 'up' | 'right' | 'down' | 'left';

/** CSS clockwise rotation (degrees) that points the face's high half toward `dir`. */
export function rotationFor(dir: Direction): 0 | 90 | 180 | 270 {
  return ({ up: 0, right: 90, down: 180, left: 270 } as const)[dir];
}

export function opposite(dir: Direction): Direction {
  return ({ up: 'down', down: 'up', left: 'right', right: 'left' } as const)[dir];
}
