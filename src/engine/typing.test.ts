import { describe, it, expect } from 'vitest';
import { beginTyping, applyKey, isPrintable } from './typing';

const typeAll = (target: string, input: string) =>
  [...input].reduce((s, k) => applyKey(s, k), beginTyping(target));

describe('beginTyping', () => {
  it('starts at the beginning with nothing typed', () => {
    const s = beginTyping('Imbi');
    expect(s.cursor).toBe(0);
    expect(s.keystrokes).toBe(0);
    expect(s.errors).toBe(0);
    expect(s.done).toBe(false);
  });
});

describe('applyKey', () => {
  it('advances on a correct key', () => {
    const s = applyKey(beginTyping('Imbi'), 'I');
    expect(s.cursor).toBe(1);
    expect(s.keystrokes).toBe(1);
    expect(s.errors).toBe(0);
  });

  it('is case-insensitive', () => {
    expect(typeAll('Imbi', 'imbi').done).toBe(true);
    expect(typeAll('KLCC', 'klcc').done).toBe(true);
  });

  it('does not advance on a wrong key but does count it', () => {
    const s = applyKey(beginTyping('Imbi'), 'x');
    expect(s.cursor).toBe(0);
    expect(s.keystrokes).toBe(1);
    expect(s.errors).toBe(1);
  });

  it('requires spaces to be typed', () => {
    const s = typeAll('KL Sentral', 'KLSentral');
    expect(s.done).toBe(false);
    expect(s.errors).toBeGreaterThan(0);
  });

  it('accepts a space in the right place', () => {
    expect(typeAll('KL Sentral', 'KL Sentral').done).toBe(true);
  });

  it('accepts digits in real station names', () => {
    expect(typeAll('SS 15', 'ss 15').done).toBe(true);
    expect(typeAll('16 Sierra', '16 sierra').done).toBe(true);
  });

  it('marks done only at the end', () => {
    const s = typeAll('Imbi', 'Imb');
    expect(s.done).toBe(false);
    expect(applyKey(s, 'i').done).toBe(true);
  });

  it('ignores further keys once done', () => {
    const done = typeAll('Imbi', 'Imbi');
    const after = applyKey(done, 'x');
    expect(after).toEqual(done);
  });

  it('ignores non-printable keys entirely', () => {
    const s = applyKey(beginTyping('Imbi'), 'Shift');
    expect(s.keystrokes).toBe(0);
    expect(s.errors).toBe(0);
  });
});

describe('isPrintable', () => {
  it('accepts single characters and rejects key names', () => {
    expect(isPrintable('a')).toBe(true);
    expect(isPrintable(' ')).toBe(true);
    expect(isPrintable('Enter')).toBe(false);
  });
});
