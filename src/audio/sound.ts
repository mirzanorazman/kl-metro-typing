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
let wantedTrack: TrackName | null = null;
let loopId: number | null = null;
let loopStep = 0;

interface Voices {
  key: Synth;
  error: MembraneSynth;
  arrive: Synth;
  complete: Synth;
  menu: Synth;
  ui: Synth;
  lead: Synth;
  bass: Synth;
  kick: MembraneSynth;
  tick: Synth;
}

type Voice = 'menu' | 'lead' | 'bass' | 'kick' | 'tick';
/** One note: which voice, what pitch, how long in seconds. */
type Note = readonly [Voice, string, number];

interface Track {
  stepMs: number;
  /** One entry per step; an empty step is a rest. */
  steps: readonly (readonly Note[])[];
}

/**
 * Music is a short pattern of steps played on a timer. `stepMs` sets the
 * tempo: an eighth note is 60000 / BPM / 2.
 */
const TRACKS = {
  /** The home map: one soft note at a time, barely there. */
  menu: {
    stepMs: 2400,
    steps: [[['menu', 'C4', 0.3]], [['menu', 'G4', 0.3]], [['menu', 'A4', 0.3]], [['menu', 'E4', 0.3]]],
  },
  /** Rush Hour setup: a light, bouncing major-pentatonic figure at 120 BPM. */
  rushSetup: {
    stepMs: 250,
    steps: [
      [['bass', 'C3', 0.2], ['lead', 'C5', 0.1]], [], [['lead', 'E5', 0.1]], [['lead', 'G5', 0.1]],
      [['bass', 'G2', 0.2]], [['lead', 'A5', 0.1]], [['lead', 'G5', 0.1]], [['lead', 'E5', 0.1]],
      [['bass', 'A2', 0.2], ['lead', 'D5', 0.1]], [], [['lead', 'E5', 0.1]], [['lead', 'G5', 0.1]],
      [['bass', 'F2', 0.2]], [['lead', 'E5', 0.1]], [['lead', 'D5', 0.1]], [],
    ],
  },
  /** A Run going fine: a steady 110 BPM pulse under the typing. */
  rushCalm: {
    stepMs: 273,
    steps: [
      [['kick', 'C2', 0.1], ['bass', 'A2', 0.2]], [], [['tick', 'A6', 0.02]], [['bass', 'A2', 0.1]],
      [['kick', 'C2', 0.1], ['bass', 'E2', 0.2]], [], [['tick', 'A6', 0.02]], [['lead', 'E5', 0.12]],
      [['kick', 'C2', 0.1], ['bass', 'F2', 0.2]], [], [['tick', 'A6', 0.02]], [['bass', 'F2', 0.1]],
      [['kick', 'C2', 0.1], ['bass', 'G2', 0.2]], [], [['tick', 'A6', 0.02]], [['lead', 'D5', 0.12]],
    ],
  },
  /** A Station overcrowding: 140 BPM, higher, with off-beat stabs. */
  rushTense: {
    stepMs: 214,
    steps: [
      [['kick', 'C2', 0.08], ['bass', 'A2', 0.1]], [['tick', 'E7', 0.02], ['lead', 'A5', 0.06]],
      [['kick', 'C2', 0.08], ['bass', 'A2', 0.1]], [['tick', 'E7', 0.02], ['lead', 'C6', 0.06]],
      [['kick', 'C2', 0.08], ['bass', 'A2', 0.1]], [['tick', 'E7', 0.02], ['lead', 'E6', 0.06]],
      [['kick', 'C2', 0.08], ['bass', 'G2', 0.1]], [['tick', 'E7', 0.02], ['lead', 'D6', 0.06]],
      [['kick', 'C2', 0.08], ['bass', 'F2', 0.1]], [['tick', 'E7', 0.02], ['lead', 'A5', 0.06]],
      [['kick', 'C2', 0.08], ['bass', 'F2', 0.1]], [['tick', 'E7', 0.02], ['lead', 'C6', 0.06]],
      [['kick', 'C2', 0.08], ['bass', 'G2', 0.1]], [['tick', 'E7', 0.02], ['lead', 'B5', 0.06]],
      [['kick', 'C2', 0.08], ['bass', 'G#2', 0.1]], [['tick', 'E7', 0.02], ['lead', 'E6', 0.06]],
    ],
  },
} satisfies Record<string, Track>;

export type TrackName = keyof typeof TRACKS;

export function setMuted(value: boolean): void {
  muted = value;
  if (muted) stopLoop();
  else startLoop();
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
    lead: new Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.005, decay: 0.1, sustain: 0.05, release: 0.12 },
      volume: -26,
    }).toDestination(),
    bass: new Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.005, decay: 0.15, sustain: 0.2, release: 0.1 },
      volume: -20,
    }).toDestination(),
    kick: new MembraneSynth({
      pitchDecay: 0.03,
      octaves: 4,
      envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.05 },
      volume: -22,
    }).toDestination(),
    tick: new Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.001, decay: 0.015, sustain: 0, release: 0.01 },
      volume: -34,
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

function stopLoop(): void {
  if (loopId !== null && typeof window !== 'undefined') {
    window.clearInterval(loopId);
  }
  loopId = null;
  loopStep = 0;
}

function beginLoop(activeVoices: Voices, track: Track): void {
  const playNext = () => {
    for (const [voice, note, duration] of track.steps[loopStep % track.steps.length]!) {
      activeVoices[voice].triggerAttackRelease(note, duration);
    }
    loopStep += 1;
  };

  playNext();
  loopId = window.setInterval(playNext, track.stepMs);
}

function startLoop(): void {
  if (!wantedTrack || muted || loopId !== null || typeof window === 'undefined') return;

  void ensureVoices().then((activeVoices) => {
    if (!activeVoices || !wantedTrack || muted || loopId !== null) return;
    beginLoop(activeVoices, TRACKS[wantedTrack]);
  });
}

function unlockAudio(): void {
  if (readyPromise) return;

  if (typeof window === 'undefined') return;

  readyPromise = (async () => {
    try {
      await start();
      if (!voices) voices = buildVoices();
      if (wantedTrack && !muted && loopId === null) beginLoop(voices, TRACKS[wantedTrack]);
      return true;
    } catch {
      readyPromise = null;
      voices = null;
      voicesPromise = null;
      stopLoop();
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

  /** Rush Hour passengers alighting at their Line: a bright three-note chime. */
  delivered: () => play(({ complete }) => {
    ['G5', 'B5', 'D6'].forEach((note, index) => {
      complete.triggerAttackRelease(note, 0.08, `+${(index * 0.06).toFixed(3)}`);
    });
  }),

  /** A Rush Hour Overflow ring passing halfway: two low, insistent pulses. */
  warning: () => play(({ error }) => {
    error.triggerAttackRelease('A1', 0.12);
    error.triggerAttackRelease('A1', 0.12, '+0.18');
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
  /** Plays `track` on a loop, replacing whatever was playing. */
  play: (track: TrackName) => {
    if (wantedTrack === track) return;
    wantedTrack = track;
    stopLoop();
    startLoop();
  },
  /** Stops the music; given a track, only if that track is the one playing. */
  stop: (track?: TrackName) => {
    if (track !== undefined && wantedTrack !== track) return;
    wantedTrack = null;
    stopLoop();
  },
  current: (): TrackName | null => wantedTrack,
  startMenu: () => music.play('menu'),
  stopMenu: () => music.stop('menu'),
};
