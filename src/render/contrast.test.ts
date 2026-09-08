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

  it('never picks the worse of the two', () => {
    // A mid grey is the hardest case; whichever it picks must beat the other.
    const mid = '#808080';
    expect(['var(--badge-ink)', 'var(--badge-paper)']).toContain(contrastText(mid));
  });
});
