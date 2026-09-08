/**
 * Relative luminance per WCAG 2.1, from an sRGB hex string.
 *
 * Line badges fill with the line's own colour, and the seven Rapid KL colours
 * span nearly the whole luminance range — the Putrajaya yellow needs dark text
 * where the Sri Petaling maroon needs white. Deriving the foreground from the
 * fill means a retuned palette can never silently drop a badge below
 * legibility, which storing it as a data field would allow.
 */
export function luminance(hex: string): number {
  const raw = hex.replace('#', '');
  const full = raw.length === 3 ? [...raw].map((c) => c + c).join('') : raw;

  const channel = (at: number): number => {
    const srgb = parseInt(full.slice(at, at + 2), 16) / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** WCAG contrast ratio between two relative luminances. */
function ratio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const INK = luminance('#14181f');
const PAPER = luminance('#ffffff');

/**
 * The readable foreground for a badge filled with `hex`, as a token reference.
 *
 * These two tokens deliberately do NOT vary by theme: a yellow badge needs
 * dark text on paper and on midnight alike, so resolving them through `--ink`
 * would make half the badges illegible in one atmosphere.
 */
export function contrastText(hex: string): string {
  const fill = luminance(hex);
  return ratio(fill, PAPER) >= ratio(fill, INK) ? 'var(--badge-paper)' : 'var(--badge-ink)';
}
