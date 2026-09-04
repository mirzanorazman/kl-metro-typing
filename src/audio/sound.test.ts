import { describe, it, expect, beforeEach, vi } from 'vitest';
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

describe('sound output', () => {
  it('creates an oscillator per tone when a context is running', async () => {
    const created: string[] = [];
    const node = () => ({ connect: (n: unknown) => n, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } });

    class FakeCtx {
      state = 'running';
      currentTime = 0;
      destination = {};
      resume() { return Promise.resolve(); }
      createGain() { created.push('gain'); return node(); }
      createOscillator() {
        created.push('osc');
        return {
          type: 'sine',
          frequency: { setValueAtTime() {} },
          connect: (n: unknown) => n,
          start() {},
          stop() {},
        };
      }
    }
    (window as unknown as { AudioContext: unknown }).AudioContext = FakeCtx;

    // Re-import so the module picks up the stubbed constructor with no cached context.
    vi.resetModules();
    const fresh = await import('./sound');
    fresh.setMuted(false);
    fresh.sound.key();

    expect(created.filter((c) => c === 'osc')).toHaveLength(1);

    fresh.setMuted(true);
    const before = created.length;
    fresh.sound.key();
    expect(created).toHaveLength(before);
  });
});
