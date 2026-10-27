/**
 * Every timed thing in the reel, in frames at 30 fps.
 *
 * Pure and Remotion-free on purpose: `scripts/soundtrack.ts` imports this
 * same module, so each key click in the soundtrack lands on the frame its
 * letter appears, and retiming a scene here moves its sound with it.
 */
import type { LineCode } from '../../src/data/types';

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const DURATION = 51.5 * FPS;

/**
 * Scene starts. Each lands on a beat of the 120 bpm score (15 frames).
 * Between modes sits a two-second breath: the panel leaves, the camera
 * glides alone while the Era ticks over, and only then does the next
 * mode's headline and panel arrive.
 */
export const SCENE = {
  hook: 0,
  core: 90,
  breathA: 300,
  lineRun: 360,
  breathB: 510,
  adventure: 570,
  breathC: 750,
  quickRun: 810,
  latest: 960,
  dispatcher: 1080,
  end: 1425,
} as const;

export const ERAS = ['1990s', '2003', '2015–17', '2022–23', 'Latest'] as const;

/* ---------- easing and interpolation ---------- */

export function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

export function easeInOut(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function easeOut(t: number): number {
  return 1 - Math.pow(1 - clamp01(t), 3);
}

/** Maps `f` from [a, b] to [from, to] with the given easing, clamped. */
export function ramp(f: number, a: number, b: number, from: number, to: number, ease = easeInOut): number {
  if (b <= a) return f < a ? from : to;
  return from + (to - from) * ease(clamp01((f - a) / (b - a)));
}

/* ---------- typing ---------- */

export interface Typed {
  text: string;
  /** Frame of each correct keystroke, one per character. */
  keys: number[];
  /** A wrong key: which character it hit and when. Cleared by that character's correct key. */
  miss?: { char: number; at: number };
  start: number;
  end: number;
}

/** Deterministic jitter so keys do not tick like a metronome. */
function jitter(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x) - 0.5;
}

/**
 * One name typed from `start`, a key every `fpc` frames (with a little human
 * unevenness). `typoAt` hits a wrong key on that character, which shows red
 * for `hold` frames before the right key lands, as the game does.
 */
export function typeOne(text: string, start: number, fpc: number, typoAt?: number, hold = 8): Typed {
  const keys: number[] = [];
  let f = start;
  let miss: Typed['miss'];
  for (let i = 0; i < text.length; i++) {
    if (i > 0) f += fpc * (1 + 0.45 * jitter(start * 31 + i));
    if (i === typoAt) {
      miss = { char: i, at: f };
      f += hold;
    }
    keys.push(f);
  }
  return { text, keys, miss, start, end: f };
}

/** Several names back to back, `gap` frames apart. `typos` maps name index to character index. */
export function typeSeq(texts: string[], start: number, fpc: number, gap: number, typos: Record<number, number> = {}): Typed[] {
  const out: Typed[] = [];
  let f = start;
  texts.forEach((text, i) => {
    const t = typeOne(text, f, fpc, typos[i]);
    out.push(t);
    f = t.end + gap;
  });
  return out;
}

export function typedAt(t: Typed, f: number): { done: number; wrong: boolean } {
  let done = 0;
  while (done < t.keys.length && t.keys[done]! <= f) done++;
  const wrong = !!t.miss && f >= t.miss.at && done === t.miss.char;
  return { done, wrong };
}

/** The name in a sequence being typed at `f`: the last one started. */
export function activeIn(seq: Typed[], f: number): Typed | undefined {
  let cur: Typed | undefined;
  for (const t of seq) if (f >= t.start - 6) cur = t;
  return cur;
}

/** How many names in a sequence are finished, eased over `glide` frames after each finish. */
export function completedEased(seq: Typed[], f: number, glide = 9): number {
  let n = 0;
  for (const t of seq) n += ramp(f, t.end, t.end + glide, 0, 1);
  return n;
}

/** Fraction of the current name typed, plus names before it: a smooth "how far along". */
export function typedProgress(seq: Typed[], f: number): number {
  let n = 0;
  for (const t of seq) {
    if (f < t.start) break;
    n += typedAt(t, f).done / t.text.length;
  }
  return n;
}

/* ---------- the scripts ---------- */

export const MR_NAMES = [
  'Tun Sambanthan', 'Maharajalela', 'Hang Tuah', 'Imbi', 'Bukit Bintang',
  'Raja Chulan', 'Bukit Nanas', 'Medan Tuanku', 'Chow Kit', 'Titiwangsa',
];

export const TYPE = {
  hook: typeOne('Gombak', 24, 5.5),
  core: typeSeq(['Taman Melati', 'Wangsa Maju', 'Sri Rampai', 'Setiawangsa'], 108, 2.8, 12, { 3: 5 }),
  lineRun: typeSeq(MR_NAMES, 384, 0.8, 1),
  junctionArrive: typeOne('Putra Heights', 592, 2.4),
  junctionLeave: typeOne('Puchong Prima', 716, 2.0),
  quickRun: typeSeq(['UPM', 'Taman Equine', 'Putra Permai', '16 Sierra'], 840, 2.3, 6),
  clear1: typeOne('Pasar Seni', 1150, 2.4),
  fix: typeSeq(['Miharja', 'Maluri', 'Pandan Jaya'], 1278, 2.2, 6),
  url: typeOne('kl-metro-typing.vercel.app', 1471, 1.5),
};

/** When the 1990s core loop finishes typing. */
export const CORE_END = TYPE.core[TYPE.core.length - 1]!.end;
/** When the Monorail's last name is typed. */
export const LINE_RUN_END = TYPE.lineRun[TYPE.lineRun.length - 1]!.end;

/** The junction choice: the "1" key that picks Sri Petaling toward Sentul Timur. */
export const JUNCTION = { show: 640, pick: 690, hide: 712 };

export const DISPATCH = {
  /** The whole board at full brightness, before it settles into focus. */
  entrance: [1080, 1140] as const,
  clear1: TYPE.clear1.end,
  greenWave: 1206,
  greenWaveSignals: [1210, 1216, 1222],
  incidentAt: 1262,
  fixed: TYPE.fix[2]!.end,
  rewind: [1360, 1380] as const,
  replay: [1380, 1420] as const,
};

/**
 * Dispatcher's spotlight: which Line is being acted on, and when. Lines and
 * Trains off the focus Line dim, so one thing at a time reads clearly.
 */
const FOCUS: { line: LineCode; from: number; to: number }[] = [
  { line: 'KJ', from: 1136, to: 1202 },
  { line: 'KG', from: 1202, to: 1258 },
  { line: 'AG', from: 1258, to: 1352 },
];

/** How strongly the spotlight is on, 0 to 1. */
export function focusAmount(f: number): number {
  return ramp(f, 1132, 1146, 0, 1) * ramp(f, 1346, 1360, 1, 0);
}

/** A Line's brightness under the spotlight: 1 lit, `dim` when another Line has focus. */
export function lineBrightness(line: LineCode, f: number, dim = 0.3): number {
  let lit = 0;
  for (const w of FOCUS) {
    if (w.line === line) lit = Math.max(lit, ramp(f, w.from - 6, w.from + 6, 0, 1) * ramp(f, w.to - 6, w.to + 6, 1, 0));
  }
  return 1 - (1 - dim) * focusAmount(f) * (1 - lit);
}

/* ---------- the network, era by era ---------- */

/**
 * The frame the network's state is read at. It follows real time except in
 * Dispatcher's close, where it rewinds to the 1990s and plays the Eras
 * forward again: Dispatcher grows the network in that same order.
 */
export function revealFrame(f: number): number {
  const [r0, r1] = DISPATCH.rewind;
  const [p0, p1] = DISPATCH.replay;
  if (f < r0) return f;
  if (f < r1) return ramp(f, r0, r1, FULL, NINETIES_DONE, easeInOut);
  if (f < p1) return ramp(f, p0, p1, NINETIES_DONE, FULL, (t) => t);
  return FULL;
}

/** Reveal frames: the 1990s network complete, and every Line complete. */
const NINETIES_DONE = 300;
const FULL = 1020;

/** How far each Line is drawn, as a fractional station index; -1 is not at all. */
export function drawnTo(line: LineCode, vf: number): number {
  switch (line) {
    case 'KJ': {
      if (vf < TYPE.hook.end) return -1;
      if (vf < CORE_END + 2) return Math.min(4, typedProgress(TYPE.core, vf));
      if (vf < SCENE.breathB) return ramp(vf, CORE_END + 2, NINETIES_DONE - 4, 4, 23);
      return ramp(vf, SCENE.breathB + 6, SCENE.breathB + 56, 23, 36);
    }
    case 'AG':
      return vf < CORE_END - 10 ? -1 : ramp(vf, CORE_END - 10, NINETIES_DONE - 8, 0, 17);
    case 'SP':
      if (vf < CORE_END - 6) return -1;
      return vf < SCENE.breathB ? ramp(vf, CORE_END - 6, NINETIES_DONE - 4, 0, 17) : ramp(vf, SCENE.breathB + 6, SCENE.breathB + 56, 17, 28);
    case 'MR':
      return vf < 372 ? -1 : typedProgress(TYPE.lineRun, vf);
    case 'KG':
      return vf < 680 ? -1 : ramp(vf, 680, 775, 0, 28);
    case 'PY':
      return vf < 778 ? -1 : ramp(vf, 778, 822, 0, 35, (t) => 1 - Math.pow(1 - t, 2));
    case 'SA':
      return vf < 962 ? -1 : ramp(vf, 962, 1012, 0, 19);
  }
}

/** Which Era the corner timeline shows, as a smooth index for its progress bar. Each ticks over in a breath. */
export function eraAt(vf: number): number {
  if (vf < SCENE.breathA) return 0;
  if (vf < SCENE.breathB) return ramp(vf, SCENE.breathA, SCENE.breathA + 12, 0, 1);
  if (vf < 776) return ramp(vf, SCENE.breathB, SCENE.breathB + 12, 1, 2);
  if (vf < SCENE.latest) return ramp(vf, 776, 788, 2, 3);
  return ramp(vf, SCENE.latest, SCENE.latest + 12, 3, 4);
}

/* ---------- the player's train ---------- */

export interface PlayerTrain {
  line: LineCode;
  at: number;
  forward: boolean;
  opacity: number;
}

export function playerTrain(f: number): PlayerTrain | null {
  if (f < TYPE.hook.end) return null;
  if (f < SCENE.breathA) {
    return { line: 'KJ', at: completedEased(TYPE.core, f), forward: true, opacity: ramp(f, CORE_END + 4, CORE_END + 18, 1, 0) };
  }
  if (f < SCENE.breathB) {
    return { line: 'MR', at: completedEased(TYPE.lineRun, f, 4), forward: true,
      opacity: Math.min(ramp(f, 370, 380, 0, 1), ramp(f, 498, 508, 1, 0)) };
  }
  if (f < JUNCTION.pick) {
    const arrived = TYPE.junctionArrive.end;
    const creep = ramp(f, 575, arrived, 33.4, 35.7, (t) => t);
    return { line: 'KJ', at: creep + ramp(f, arrived, arrived + 10, 0, 36 - 35.7),
      forward: true, opacity: ramp(f, 575, 585, 0, 1) };
  }
  if (f < 760) {
    return { line: 'SP', at: 28 - 0.25 * typedProgress([TYPE.junctionLeave], f) - ramp(f, TYPE.junctionLeave.end, 760, 0, 0.6),
      forward: false, opacity: ramp(f, 744, 754, 1, 0) };
  }
  if (f < 826) return null;
  if (f < SCENE.latest + 2) {
    return { line: 'PY', at: 28 + completedEased(TYPE.quickRun, f), forward: true,
      opacity: Math.min(ramp(f, 826, 834, 0, 1), ramp(f, 952, 960, 1, 0)) };
  }
  return null;
}

/* ---------- sound cues (read by the soundtrack script) ---------- */

export type Cue =
  | { f: number; kind: 'key'; soft?: boolean }
  | { f: number; kind: 'miss' }
  | { f: number; kind: 'arrive'; note: number }
  | { f: number; kind: 'whoosh'; len: number; reverse?: boolean }
  | { f: number; kind: 'select' }
  | { f: number; kind: 'clear' }
  | { f: number; kind: 'alert' }
  | { f: number; kind: 'fixed' }
  | { f: number; kind: 'pluck'; note: number }
  | { f: number; kind: 'impact' };

export const BADGE_FRAMES = [1008, 1012, 1016, 1020, 1024, 1028, 1032];

export function cues(): Cue[] {
  const out: Cue[] = [];
  const typed = (t: Typed, soft = false, arrive?: number) => {
    for (const k of t.keys) out.push({ f: k, kind: 'key', soft });
    if (t.miss) out.push({ f: t.miss.at, kind: 'miss' });
    if (arrive !== undefined) out.push({ f: t.end + 1, kind: 'arrive', note: arrive });
  };
  // Arrival chimes climb the A minor pentatonic, one step per station.
  const scale = [69, 72, 74, 76, 79, 81, 84, 86, 88, 91];
  typed(TYPE.hook, false, 69);
  TYPE.core.forEach((t, i) => typed(t, false, scale[(i + 1) % scale.length]));
  TYPE.lineRun.forEach((t, i) => typed(t, true, i === TYPE.lineRun.length - 1 ? 93 : undefined));
  typed(TYPE.junctionArrive, false, 76);
  out.push({ f: JUNCTION.pick, kind: 'select' });
  typed(TYPE.junctionLeave, false, 79);
  TYPE.quickRun.forEach((t, i) => typed(t, false, scale[i + 3]));
  typed(TYPE.clear1);
  out.push({ f: DISPATCH.clear1, kind: 'clear' });
  for (const f of DISPATCH.greenWaveSignals) out.push({ f, kind: 'clear' });
  out.push({ f: DISPATCH.incidentAt, kind: 'alert' });
  TYPE.fix.forEach((t) => typed(t));
  out.push({ f: DISPATCH.fixed + 1, kind: 'fixed' });
  typed(TYPE.url, true);

  out.push({ f: CORE_END - 14, kind: 'whoosh', len: 1.4 });
  out.push({ f: SCENE.breathA, kind: 'whoosh', len: 1.6 });
  out.push({ f: SCENE.breathB, kind: 'whoosh', len: 2.0 });
  out.push({ f: 680, kind: 'whoosh', len: 3.0 });
  out.push({ f: 776, kind: 'whoosh', len: 1.6 });
  out.push({ f: SCENE.latest, kind: 'whoosh', len: 1.6 });
  out.push({ f: SCENE.dispatcher - 2, kind: 'whoosh', len: 1.2 });
  out.push({ f: DISPATCH.rewind[0], kind: 'whoosh', len: 0.7, reverse: true });
  out.push({ f: DISPATCH.replay[0], kind: 'whoosh', len: 1.4 });
  BADGE_FRAMES.forEach((f, i) => out.push({ f, kind: 'pluck', note: [57, 60, 64, 67, 69, 72, 76][i]! }));
  out.push({ f: SCENE.end + 12, kind: 'impact' });
  return out.sort((a, b) => a.f - b.f);
}
