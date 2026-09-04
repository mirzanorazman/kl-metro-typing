/**
 * Synthesised sound. Tone.js stays in-process and offline, but takes over the
 * browser-facing context startup so Safari's autoplay rules are handled by a
 * library that already knows the edge cases better than our hand-rolled path.
 *
 * Everything degrades to a no-op when there is no browser audio stack or when
 * muted, so callers never need to check.
 */

import { MembraneSynth, start, Synth } from 'tone';

let muted = false;
let unlockInstalled = false;
let readyPromise: Promise<boolean> | null = null;
let voicesPromise: Promise<Voices | null> | null = null;
let voices: Voices | null = null;
let menuWanted = false;
let menuLoopId: number | null = null;
let menuStep = 0;

interface Voices {
  key: Synth;
  error: MembraneSynth;
  arrive: Synth;
  complete: Synth;
  menu: Synth;
  ui: Synth;
}

export function setMuted(value: boolean): void {
  muted = value;
  if (muted) stopMenuLoop();
  else startMenuLoop();
}

export function isMuted(): boolean {
  return muted;
}

function buildVoices(): Voices {
  return {
    key: new Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.02 },
      volume: -16,
    }).toDestination(),
    error: new MembraneSynth({
      pitchDecay: 0.04,
      octaves: 3,
      envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.04 },
      volume: -10,
    }).toDestination(),
    arrive: new Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.002, decay: 0.08, sustain: 0.04, release: 0.08 },
      volume: -14,
    }).toDestination(),
    complete: new Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.002, decay: 0.12, sustain: 0.05, release: 0.14 },
      volume: -12,
    }).toDestination(),
    menu: new Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.03, decay: 0.2, sustain: 0.15, release: 0.8 },
      volume: -28,
    }).toDestination(),
    ui: new Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.05 },
      volume: -18,
    }).toDestination(),
  };
}

function ensureVoices(): Promise<Voices | null> {
  if (voices) return Promise.resolve(voices);
  if (!readyPromise) return Promise.resolve(null);
  if (!voicesPromise) {
    voicesPromise = readyPromise.then((ready) => {
      if (!ready) return null;
      voices = buildVoices();
      return voices;
    });
  }
  return voicesPromise;
}

function play(trigger: (voices: Voices) => void): void {
  if (muted || !readyPromise) return;

  void ensureVoices().then((voices) => {
    if (!voices || muted) return;
    trigger(voices);
  });
}

function stopMenuLoop(): void {
  if (menuLoopId !== null && typeof window !== 'undefined') {
    window.clearInterval(menuLoopId);
  }
  menuLoopId = null;
  menuStep = 0;
}

function beginMenuLoop(activeVoices: Voices): void {
  const notes = ['C4', 'G4', 'A4', 'E4'] as const;
  const playNext = () => {
    activeVoices.menu.triggerAttackRelease(notes[menuStep % notes.length]!, 0.3);
    menuStep += 1;
  };

  playNext();
  menuLoopId = window.setInterval(playNext, 2400);
}

function startMenuLoop(): void {
  if (!menuWanted || muted || menuLoopId !== null || typeof window === 'undefined') return;

  void ensureVoices().then((activeVoices) => {
    if (!activeVoices || !menuWanted || muted || menuLoopId !== null) return;
    beginMenuLoop(activeVoices);
  });
}

function unlockAudio(): void {
  if (readyPromise) return;

  if (typeof window === 'undefined') return;

  readyPromise = (async () => {
    try {
      await start();
      if (!voices) voices = buildVoices();
      if (menuWanted && !muted && menuLoopId === null) beginMenuLoop(voices);
      return true;
    } catch {
      readyPromise = null;
      voices = null;
      voicesPromise = null;
      stopMenuLoop();
      return false;
    }
  })();
}

/**
 * Browsers only allow audio to start from inside a real user-gesture handler.
 * The game plays sounds from effects, so we explicitly start Tone on the first
 * genuine keydown or pointerdown and let later sounds piggyback on that.
 */
export function installAudioUnlock(): void {
  if (typeof window === 'undefined' || unlockInstalled) return;
  unlockInstalled = true;

  const unlock = () => {
    unlockAudio();
    window.removeEventListener('keydown', unlock);
    window.removeEventListener('pointerdown', unlock);
  };

  window.addEventListener('keydown', unlock);
  window.addEventListener('pointerdown', unlock);
}

export const sound = {
  /** A correct keystroke. Pitch jitters so 37 stations do not fatigue. */
  key: () => play(({ key }) => key.triggerAttackRelease(1500 + Math.random() * 220, 0.016)),

  /** A mistyped key: low and punchy, unmistakably different from a keystroke. */
  error: () => play(({ error }) => error.triggerAttackRelease('C2', 0.09)),

  /** Pulling into a station: a two-note rise. */
  arrive: () => play(({ arrive }) => {
    arrive.triggerAttackRelease('E5', 0.09);
    arrive.triggerAttackRelease('A5', 0.15, '+0.07');
  }),

  /** Finishing a line: a short ascending figure. */
  complete: () => play(({ complete }) => {
    ['C5', 'D5', 'E5', 'G5'].forEach((note, index) => {
      complete.triggerAttackRelease(note, 0.15, `+${(index * 0.095).toFixed(3)}`);
    });
  }),

  /** Choosing a button or opening a panel: quick and light. */
  select: () => play(({ ui }) => {
    ui.triggerAttackRelease('E5', 0.08);
    ui.triggerAttackRelease('G5', 0.08, '+0.04');
  }),

  /** Returning to the map: the same cue but falling away. */
  back: () => play(({ ui }) => {
    ui.triggerAttackRelease('G5', 0.08);
    ui.triggerAttackRelease('E5', 0.08, '+0.04');
  }),
};

export const music = {
  startMenu: () => {
    menuWanted = true;
    startMenuLoop();
  },
  stopMenu: () => {
    menuWanted = false;
    stopMenuLoop();
  },
};
