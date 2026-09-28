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
  it('plays one music track at a time and switches on request', async () => {
    vi.useFakeTimers();
    const sound = await loadSound();

    sound.installAudioUnlock();
    window.dispatchEvent(new Event('pointerdown'));
    await flushPromises();

    sound.music.play('rushCalm');
    await flushPromises();
    expect(sound.music.current()).toBe('rushCalm');
    const calmNotes = toneMock.synthTrigger.mock.calls.length + toneMock.membraneTrigger.mock.calls.length;
    expect(calmNotes).toBeGreaterThan(0);

    sound.music.play('rushTense');
    await flushPromises();
    expect(sound.music.current()).toBe('rushTense');

    sound.music.stop();
    toneMock.synthTrigger.mockClear();
    toneMock.membraneTrigger.mockClear();
    vi.advanceTimersByTime(5000);
    await flushPromises();
    expect(sound.music.current()).toBeNull();
    expect(toneMock.synthTrigger).not.toHaveBeenCalled();
    expect(toneMock.membraneTrigger).not.toHaveBeenCalled();
  });

  it('keeps the tense track faster than the calm one', async () => {
    vi.useFakeTimers();
    const sound = await loadSound();

    sound.installAudioUnlock();
    window.dispatchEvent(new Event('pointerdown'));
    await flushPromises();

    const notesIn = async (track: 'rushCalm' | 'rushTense') => {
      sound.music.play(track);
      await flushPromises();
      toneMock.synthTrigger.mockClear();
      toneMock.membraneTrigger.mockClear();
      vi.advanceTimersByTime(8000);
      await flushPromises();
      const n = toneMock.synthTrigger.mock.calls.length + toneMock.membraneTrigger.mock.calls.length;
      sound.music.stop();
      return n;
    };
    expect(await notesIn('rushTense')).toBeGreaterThan(await notesIn('rushCalm'));
  });

  it('stopping a track that is not playing leaves the current one alone', async () => {
    const sound = await loadSound();
    sound.music.play('rushSetup');
    sound.music.stop('menu');
    expect(sound.music.current()).toBe('rushSetup');
    sound.music.stop('rushSetup');
    expect(sound.music.current()).toBeNull();
  });
});
