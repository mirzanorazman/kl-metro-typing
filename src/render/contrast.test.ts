import { describe, it, expect } from 'vitest';
import { luminance, contrastText } from './contrast';

describe('luminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(luminance('#000000')).toBeCloseTo(0, 5);
    expect(luminance('#ffffff')).toBeCloseTo(1, 5);
  });

  it('accepts shorthand hex', () => {
    expect(luminance('#fff')).toBeCloseTo(1, 5);
  });
});

describe('contrastText', () => {
  it('puts white on the dark rail colours', () => {
    expect(contrastText('#ED254E')).toBe('var(--badge-paper)'); // KJ
    expect(contrastText('#98002E')).toBe('var(--badge-paper)'); // SP
  });

  it('puts ink on the light rail colours', () => {
    expect(contrastText('#F78F1E')).toBe('var(--badge-ink)'); // AG
    expect(contrastText('#0099FF')).toBe('var(--badge-ink)'); // SA
    expect(contrastText('#84BD00')).toBe('var(--badge-ink)'); // MR
    expect(contrastText('#00A859')).toBe('var(--badge-ink)'); // KG
    expect(contrastText('#FFC72C')).toBe('var(--badge-ink)'); // PY
  });

  // The two badge tokens contrastText() picks between — mirrored here
  // (rather than imported) so this test computes its own independent
  // judgement of which token is better, instead of trusting the function
  // under test to grade itself. Same two hexes contrast.ts itself mirrors
  // from --badge-ink / --badge-paper, for the same reason (see the comment
  // there): JS cannot read a CSS custom property.
  const INK = luminance('#14181f');
  const PAPER = luminance('#ffffff');
  const wcagRatio = (a: number, b: number): number =>
    (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

  /** The token whose ratio against `fill` is strictly higher — ties go to ink. */
  const betterToken = (hex: string): string => {
    const fill = luminance(hex);
    const paperRatio = wcagRatio(fill, PAPER);
    const inkRatio = wcagRatio(fill, INK);
    return paperRatio > inkRatio ? 'var(--badge-paper)' : 'var(--badge-ink)';
  };

  it('never picks the worse of the two', () => {
    // A mid grey is the hardest case, and the two ends of the rail palette's
    // luminance range are the easiest — all three are checked against a
    // contrast ratio computed independently in this test, not merely
    // checked for membership in the set of possible return values (which
    // would pass even if contrastText always returned the same token).
    const mid = '#808080'; // hardest case
    const dark = '#98002E'; // SP — darkest rail colour
    const light = '#FFC72C'; // PY — lightest rail colour
    for (const hex of [mid, dark, light]) {
      expect(contrastText(hex)).toBe(betterToken(hex));
    }
  });
});
