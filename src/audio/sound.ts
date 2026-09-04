/**
 * Synthesised sound. No audio files, no licensing, no network requests — the
 * whole set is oscillators with fast gain envelopes, which suits the game's
 * flat aesthetic and keeps the app working offline.
 *
 * Everything degrades to a no-op when there is no AudioContext (jsdom, older
 * browsers) or when muted, so callers never need to check.
 */

let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(value: boolean): void {
  muted = value;
}

export function isMuted(): boolean {
  return muted;
}

type Ctor = typeof AudioContext;

function audio(): AudioContext | null {
  if (muted) return null;
  if (typeof window === 'undefined') return null;

  const Ctor: Ctor | undefined =
    window.AudioContext ?? (window as { webkitAudioContext?: Ctor }).webkitAudioContext;
  if (!Ctor) return null;

  try {
    if (!ctx) ctx = new Ctor();
    // Browsers start the context suspended until a user gesture. Every call
    // site here follows a keystroke, so resuming lazily is safe.
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

interface BlipOptions {
  type?: OscillatorType;
  gain?: number;
  delayMs?: number;
}

/** One tone with a fast decay. Short envelopes read as clicks, longer as notes. */
function blip(freq: number, ms: number, opts: BlipOptions = {}): void {
  const c = audio();
  if (!c) return;

  const { type = 'sine', gain = 0.05, delayMs = 0 } = opts;
  const start = c.currentTime + delayMs / 1000;

  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);

  // Ramp from a hair above zero: exponentialRamp cannot reach or start at 0.
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + 0.005);
  env.gain.exponentialRampToValueAtTime(0.0001, start + ms / 1000);

  osc.connect(env).connect(c.destination);
  osc.start(start);
  osc.stop(start + ms / 1000 + 0.02);
}

export const sound = {
  /** A correct keystroke. Pitch jitters so 37 stations do not fatigue. */
  key: () => blip(1500 + Math.random() * 220, 16, { gain: 0.035 }),

  /** A mistyped key: low and buzzy, unmistakably different from a keystroke. */
  error: () => blip(110, 90, { type: 'square', gain: 0.07 }),

  /** Pulling into a station: a two-note rise. */
  arrive: () => {
    blip(660, 90, { gain: 0.045 });
    blip(880, 150, { gain: 0.045, delayMs: 70 });
  },

  /** Finishing a line: a short ascending figure. */
  complete: () => {
    [0, 2, 4, 7].forEach((semitones, i) =>
      blip(523.25 * Math.pow(2, semitones / 12), 150, {
        type: 'triangle',
        gain: 0.055,
        delayMs: i * 95,
      }),
    );
  },
};
