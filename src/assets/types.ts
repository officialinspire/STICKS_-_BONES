/**
 * Typed asset manifest contracts.
 *
 * Every number in the manifest (bytes, sha256, dimensions, frame rectangles)
 * was measured from the owner's source file, and `npm run assets:verify`
 * re-measures the files and fails on any mismatch. Source art is never edited
 * in place: if a derivative is needed later it gets its own manifest entry.
 */

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export type AssetCategory = 'character' | 'tile' | 'effect' | 'table' | 'environment';

/**
 * runtime   — referenced by the app (bundled by Vite).
 * variant   — alternative take kept for later stages; not bundled yet.
 * reference — modeling/turnaround sheet with an opaque background; not for runtime.
 * duplicate — byte-identical copy of another entry; preserved, never bundled.
 * Generated derivatives (e.g. the tile atlas) carry `derivedFrom` and live under assets/generated/.
 */
export type AssetStatus = 'runtime' | 'variant' | 'reference' | 'duplicate';

export type DetectSpec =
  | { readonly kind: 'alpha'; readonly alphaThreshold: number }
  | { readonly kind: 'background'; readonly distance: number };

export interface SpriteFrame {
  readonly id: string;
  readonly label: string;
  /** Tight content bounds (what to draw). */
  readonly rect: Rect;
  /** Search cell bounded by detected cut lines (safe padding region). */
  readonly cell: Rect;
  /** Content crosses a cut line into a neighbouring cell (faint halo or limb). */
  readonly touchesNeighbor: boolean;
}

export interface SheetLayout {
  readonly rows: number;
  readonly cols: number;
  readonly detect: DetectSpec;
}

export interface ImageAsset {
  readonly id: string;
  readonly category: AssetCategory;
  readonly status: AssetStatus;
  /** Repo-relative path of the preserved source file. */
  readonly path: string;
  /** Filename as originally uploaded to the repository root. */
  readonly originalName: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly width: number;
  readonly height: number;
  readonly hasAlpha: boolean;
  readonly duplicateOf?: string;
  /** Present on generated derivatives: the source asset id they were built from. */
  readonly derivedFrom?: string;
  /** Present for sheets/framed images. Frames are row-major. */
  readonly layout?: SheetLayout;
  readonly frames?: readonly SpriteFrame[];
  readonly proposedUse: string;
}

export interface MissingAsset {
  readonly id: string;
  readonly kind: 'audio' | 'video' | 'image';
  readonly description: string;
  readonly fallback: string;
}
