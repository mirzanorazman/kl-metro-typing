import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toneMock = vi.hoisted(() => {
  const start = vi.fn(async () => {});
  const synthTrigger = vi.fn();
  const membraneTrigger = vi.fn();

  class Synth {
    toDestination() {
      return this;
    }

    triggerAttackRelease(...args: unknown[]) {
      synthTrigger(...args);
      return this;
    }

    dispose() {
      return this;
    }
  }

  class MembraneSynth {
    toDestination() {
      return this;
    }

    triggerAttackRelease(...args: unknown[]) {
      membraneTrigger(...args);
      return this;
    }

    dispose() {
      return this;
    }
  }

  return {
    start,
    synthTrigger,
    membraneTrigger,
    Synth,
    MembraneSynth,
  };
});

vi.mock('tone', () => ({
  start: toneMock.start,
  Synth: toneMock.Synth,
  MembraneSynth: toneMock.MembraneSynth,
}));

async function loadSound() {
  vi.resetModules();
  return import('./sound');
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('sound', () => {
  beforeEach(() => {
    toneMock.start.mockClear();
    toneMock.synthTrigger.mockClear();
    toneMock.membraneTrigger.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports its mute state', async () => {
    const sound = await loadSound();
    sound.setMuted(true);
    expect(sound.isMuted()).toBe(true);
    sound.setMuted(false);
    expect(sound.isMuted()).toBe(false);
  });

  it('is safe when sound has not been unlocked yet', async () => {
    const sound = await loadSound();

    expect(() => {
      sound.sound.key();
      sound.sound.error();
      sound.sound.arrive();
      sound.sound.complete();
    }).not.toThrow();

    expect(toneMock.synthTrigger).not.toHaveBeenCalled();
    expect(toneMock.membraneTrigger).not.toHaveBeenCalled();
  });

  it('starts Tone from the first real gesture', async () => {
    const sound = await loadSound();

    sound.installAudioUnlock();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    await flushPromises();

    expect(toneMock.start).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event('pointerdown'));
    await flushPromises();
    expect(toneMock.start).toHaveBeenCalledTimes(1);
  });

  it('plays through Tone once unlocked', async () => {
    const sound = await loadSound();

    sound.installAudioUnlock();
    window.dispatchEvent(new Event('pointerdown'));
    await flushPromises();

    sound.sound.key();
    sound.sound.error();
    sound.sound.arrive();
    sound.sound.complete();
    await flushPromises();

    expect(toneMock.synthTrigger).toHaveBeenCalled();
    expect(toneMock.membraneTrigger).toHaveBeenCalledTimes(1);
  });

  it('stays silent when muted', async () => {
    const sound = await loadSound();

    sound.installAudioUnlock();
    window.dispatchEvent(new Event('pointerdown'));
    await flushPromises();

    sound.setMuted(true);
    sound.sound.key();
    sound.sound.error();

    expect(toneMock.synthTrigger).not.toHaveBeenCalled();
    expect(toneMock.membraneTrigger).not.toHaveBeenCalled();
  });

  it('starts menu music after unlock when it was requested beforehand', async () => {
    vi.useFakeTimers();
    const sound = await loadSound();

    sound.music.startMenu();
    await flushPromises();
    expect(toneMock.synthTrigger).not.toHaveBeenCalled();

    sound.installAudioUnlock();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    await flushPromises();

    expect(toneMock.start).toHaveBeenCalledTimes(1);
    expect(toneMock.synthTrigger).toHaveBeenCalledTimes(1);
  });

  it('loops menu music until stopped', async () => {
    vi.useFakeTimers();
    const sound = await loadSound();

    sound.installAudioUnlock();
    window.dispatchEvent(new Event('pointerdown'));
    await flushPromises();

    sound.music.startMenu();
    await flushPromises();
    expect(toneMock.synthTrigger).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2400);
    await flushPromises();
    expect(toneMock.synthTrigger).toHaveBeenCalledTimes(2);

    sound.music.stopMenu();
    vi.advanceTimersByTime(4800);
    await flushPromises();
    expect(toneMock.synthTrigger).toHaveBeenCalledTimes(2);
  });
});
