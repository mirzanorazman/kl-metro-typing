import { describe, it, expect, beforeEach } from 'vitest';
import { sound, setMuted, isMuted } from './sound';

describe('sound', () => {
  beforeEach(() => setMuted(false));

  it('reports its mute state', () => {
    setMuted(true);
    expect(isMuted()).toBe(true);
    setMuted(false);
    expect(isMuted()).toBe(false);
  });

  it('is safe with no AudioContext available', () => {
    // jsdom provides none, and callers must never have to check.
    expect(() => {
      sound.key();
      sound.error();
      sound.arrive();
      sound.complete();
    }).not.toThrow();
  });

  it('is silent when muted', () => {
    setMuted(true);
    expect(() => sound.key()).not.toThrow();
  });
});
