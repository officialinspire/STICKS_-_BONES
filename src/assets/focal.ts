/**
 * Focal points of the seven environment backdrops (fractions of the image), the single source for
 * both the staging (`background-position`) and the portrait crops built by `npm run assets:derive`.
 * A test keeps src/story/staging.ts in step with this table.
 */
export const ENV_IDS = ['env.neighborhood-patio', 'env.cave-waterfall', 'env.back-alley', 'env.resort-patio', 'env.moonlit-promenade', 'env.jungle-camp', 'env.executive-terrace'] as const;
export type EnvId = (typeof ENV_IDS)[number];

export const ENV_FOCUS: Readonly<Record<EnvId, { readonly x: number; readonly y: number }>> = {
  'env.neighborhood-patio': { x: 0.5, y: 0.55 },
  'env.cave-waterfall': { x: 0.5, y: 0.4 },
  'env.back-alley': { x: 0.45, y: 0.5 },
  'env.resort-patio': { x: 0.5, y: 0.5 },
  'env.moonlit-promenade': { x: 0.5, y: 0.6 },
  'env.jungle-camp': { x: 0.5, y: 0.45 },
  'env.executive-terrace': { x: 0.5, y: 0.5 },
};

/** Portrait crops are 3:4 (width / height), so they cover every viewport up to a 3:4 tablet in portrait. */
export const PORTRAIT_ASPECT = 3 / 4;

/** The crop rectangle (source pixels) for a focal x: centred on it, clamped inside the image. */
export function portraitCrop(width: number, height: number, fx: number): { x: number; y: number; w: number; h: number } {
  const w = Math.round(height * PORTRAIT_ASPECT);
  const x = Math.max(0, Math.min(width - w, Math.round(fx * width - w / 2)));
  return { x, y: 0, w, h: height };
}

export function isEnv(id: string): id is EnvId {
  return (ENV_IDS as readonly string[]).includes(id);
}
