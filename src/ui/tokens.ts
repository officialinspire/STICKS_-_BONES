/**
 * STICKS & BONES design tokens — the palette and the ONLY approved pairings.
 *
 * A palette is not permission to use every pairing: e.g. sun gold on warm
 * ivory is 1.65:1 and must never carry text. `PAIRINGS` lists every
 * foreground/background combination the stylesheet uses, with the WCAG 2.x
 * requirement it must meet; `tokens.test.ts` recomputes each ratio (including
 * disabled states, the focus ring and scrims over a worst-case white backdrop)
 * and checks that src/styles.css declares exactly these hex values.
 */
export const PALETTE = {
  deepSea: '#083F43',
  teal: '#087F80',
  guava: '#D94F45',
  gold: '#F2B544',
  ivory: '#FFF2D8',
  ink: '#14252B',
} as const;
export type Token = keyof typeof PALETTE;

/** CSS custom property for each token (declared once in :root). */
export const CSS_VAR: Record<Token, string> = {
  deepSea: '--sb-deep-sea',
  teal: '--sb-teal',
  guava: '--sb-guava',
  gold: '--sb-gold',
  ivory: '--sb-ivory',
  ink: '--sb-ink',
};

/** WCAG thresholds: 4.5 normal text, 3 large/bold text and non-text UI (borders, focus, icons). */
export type Need = 'text' | 'large-text' | 'ui';
export const MIN: Record<Need, number> = { text: 4.5, 'large-text': 3, ui: 3 };

export interface Pairing {
  readonly fg: Token;
  readonly bg: Token;
  readonly need: Need;
  /** Foreground opacity over the background (disabled states). */
  readonly alpha?: number;
  readonly use: string;
}

export const PAIRINGS: readonly Pairing[] = [
  { fg: 'ink', bg: 'ivory', need: 'text', use: 'Body text, dialogue, sheets, cards' },
  { fg: 'deepSea', bg: 'ivory', need: 'text', use: 'Headings and speaker labels on light panels' },
  { fg: 'ivory', bg: 'deepSea', need: 'text', use: 'Text on dark panels, HUD, menu buttons' },
  { fg: 'ivory', bg: 'ink', need: 'text', use: 'Text on night panels and the privacy cover' },
  { fg: 'ink', bg: 'gold', need: 'text', use: 'Primary action buttons (gold fill, dark text)' },
  { fg: 'gold', bg: 'deepSea', need: 'text', use: 'Highlights on dark: turn banner, your score, kicker' },
  { fg: 'gold', bg: 'ink', need: 'text', use: 'Highlights on night panels' },
  { fg: 'teal', bg: 'ivory', need: 'large-text', use: 'Large/bold accents only (chapter numbers, points line)' },
  { fg: 'guava', bg: 'ivory', need: 'large-text', use: 'Large/bold accents only (match winner line)' },
  { fg: 'guava', bg: 'ivory', need: 'ui', use: 'Destructive button outline and icon on light surfaces' },
  { fg: 'teal', bg: 'ivory', need: 'ui', use: 'Selected-chip and input borders on light surfaces' },
  { fg: 'gold', bg: 'deepSea', need: 'ui', use: 'Focus ring and legal-tile outline on dark surfaces' },
  { fg: 'ink', bg: 'ivory', need: 'ui', use: 'Focus ring inner band on light surfaces' },
  { fg: 'gold', bg: 'ink', need: 'ui', use: 'Focus ring on night surfaces' },
  { fg: 'ivory', bg: 'deepSea', need: 'large-text', alpha: 0.62, use: 'Disabled button label on dark (exempt from 1.4.3, still kept ≥ 3:1)' },
  { fg: 'ink', bg: 'ivory', need: 'large-text', alpha: 0.55, use: 'Disabled control label on light (exempt, kept ≥ 3:1)' },
];

/** Pairings that must NEVER carry text (documented, and asserted to stay below 3:1). */
export const FORBIDDEN_TEXT: readonly [Token, Token][] = [
  ['gold', 'ivory'],
  ['teal', 'guava'],
  ['deepSea', 'ink'],
  ['gold', 'guava'],
  ['teal', 'deepSea'],
];

/** Dark scrims laid over photographic backdrops: token, opacity, and the text they carry. */
export const SCRIMS: readonly { readonly scrim: Token; readonly alpha: number; readonly text: Token; readonly use: string }[] = [
  { scrim: 'deepSea', alpha: 0.84, text: 'ivory', use: 'Menu/story panels over the environment art' },
  { scrim: 'ink', alpha: 0.86, text: 'ivory', use: 'HUD seats and hand tray over the table' },
  { scrim: 'ink', alpha: 0.86, text: 'gold', use: 'Turn banner chip' },
];

// ---- WCAG maths ---------------------------------------------------------------------
export function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function luminance([r, g, b]: [number, number, number]): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function mix(fg: [number, number, number], bg: [number, number, number], alpha: number): [number, number, number] {
  return [0, 1, 2].map((i) => fg[i]! * alpha + bg[i]! * (1 - alpha)) as [number, number, number];
}
export function contrast(a: [number, number, number], b: [number, number, number]): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
export function pairingRatio(p: Pairing): number {
  const bg = rgb(PALETTE[p.bg]);
  const fg = p.alpha === undefined ? rgb(PALETTE[p.fg]) : mix(rgb(PALETTE[p.fg]), bg, p.alpha);
  return contrast(fg, bg);
}
/** Text on a scrim over the WORST backdrop pixel (pure white, or pure black for light text — whichever is lower). */
export function scrimRatio(s: (typeof SCRIMS)[number]): number {
  const text = rgb(PALETTE[s.text]);
  const overWhite = mix(rgb(PALETTE[s.scrim]), [255, 255, 255], s.alpha);
  const overBlack = mix(rgb(PALETTE[s.scrim]), [0, 0, 0], s.alpha);
  return Math.min(contrast(text, overWhite), contrast(text, overBlack));
}
