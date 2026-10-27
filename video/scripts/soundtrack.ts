/**
 * Synthesises the reel's soundtrack to public/soundtrack.wav.
 *
 * Everything is generated here, so there is no licensed audio to track. The
 * score is 120 bpm in A minor and gains one layer per Era: a pad for the
 * 1990s, hats for 2003, bass for 2015–17, kick and arpeggio for 2022–23,
 * and clap for Dispatcher. Sound effects come from `cues()` in the timeline,
 * so every key click lands on the frame its letter appears.
 *
 *   npx tsx scripts/soundtrack.ts
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DISPATCH, DURATION, FPS, SCENE, cues } from '../src/timeline';

const SR = 48000;
const LEN = Math.round((DURATION / FPS) * SR);
const BEAT = 0.5;

/** Section starts, in seconds. Each layer enters as its Era ticks over in a breath. */
const T = {
  pad: SCENE.core / FPS,
  hats: SCENE.breathA / FPS,
  bass: SCENE.breathB / FPS,
  // The 2022–23 tick lands on frame 776; the drums start on the beat at 26 s.
  drums: 26,
  clap: SCENE.latest / FPS,
  dispatch: SCENE.dispatcher / FPS,
  rewind: DISPATCH.rewind[0] / FPS,
  replay: DISPATCH.replay[0] / FPS,
  end: SCENE.end / FPS,
};

/* ---------- primitives ---------- */

let seed = 1;
function rand(): number {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}
const noise = () => rand() * 2 - 1;
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const s2i = (s: number) => Math.round(s * SR);

class Stereo {
  l = new Float32Array(LEN);
  r = new Float32Array(LEN);
  add(i: number, v: number, pan = 0) {
    if (i < 0 || i >= LEN) return;
    this.l[i]! += v * Math.cos(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
    this.r[i]! += v * Math.sin(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
  }
}

type FilterType = 'lp' | 'hp' | 'bp';

/** RBJ biquad. */
class Biquad {
  private b0 = 1; private b1 = 0; private b2 = 0; private a1 = 0; private a2 = 0;
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0;
  constructor(private type: FilterType, freq: number, private q = 0.707) { this.set(freq); }
  set(freq: number, q = this.q) {
    const w = (2 * Math.PI * Math.min(freq, SR * 0.45)) / SR;
    const alpha = Math.sin(w) / (2 * q);
    const cos = Math.cos(w);
    let b0: number, b1: number, b2: number;
    if (this.type === 'lp') { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2; }
    else if (this.type === 'hp') { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2; }
    else { b0 = alpha; b1 = 0; b2 = -alpha; }
    const a0 = 1 + alpha;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0;
    this.a1 = (-2 * cos) / a0; this.a2 = (1 - alpha) / a0;
  }
  run(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

/** Filters a whole bus in place, with the cutoff following `cutoff(seconds)`. */
function filterBus(bus: Stereo, type: FilterType, cutoff: (t: number) => number, q = 0.707) {
  const fl = new Biquad(type, cutoff(0), q);
  const fr = new Biquad(type, cutoff(0), q);
  for (let i = 0; i < LEN; i++) {
    if (i % 64 === 0) { const c = cutoff(i / SR); fl.set(c); fr.set(c); }
    bus.l[i] = fl.run(bus.l[i]!);
    bus.r[i] = fr.run(bus.r[i]!);
  }
}

/** A Schroeder reverb: four damped combs into two allpasses, per channel. */
function reverb(src: Stereo, mix: number, out: Stereo) {
  const run = (input: Float32Array, spread: number) => {
    const combs = [1557, 1617, 1491, 1422].map((d) => ({ buf: new Float32Array(Math.round((d + spread) * 1.09)), i: 0, lp: 0 }));
    const aps = [225, 556].map((d) => ({ buf: new Float32Array(Math.round((d + spread) * 1.09)), i: 0 }));
    const o = new Float32Array(LEN);
    for (let n = 0; n < LEN; n++) {
      const x = input[n]!;
      let y = 0;
      for (const c of combs) {
        const v = c.buf[c.i]!;
        c.lp = v * 0.6 + c.lp * 0.4;
        c.buf[c.i] = x + c.lp * 0.82;
        c.i = (c.i + 1) % c.buf.length;
        y += v;
      }
      for (const a of aps) {
        const v = a.buf[a.i]!;
        const w = y + v * 0.5;
        a.buf[a.i] = w;
        a.i = (a.i + 1) % a.buf.length;
        y = v - w * 0.5;
      }
      o[n] = y * 0.25;
    }
    return o;
  };
  const l = run(src.l, 0);
  const r = run(src.r, 23);
  for (let n = 0; n < LEN; n++) { out.l[n]! += l[n]! * mix; out.r[n]! += r[n]! * mix; }
}

/* ---------- the score ---------- */

const CHORDS: { bass: number; notes: number[] }[] = [
  { bass: 45, notes: [57, 60, 64, 71] }, // Am9
  { bass: 41, notes: [53, 57, 60, 64] }, // Fmaj7
  { bass: 48, notes: [55, 60, 62, 67] }, // Cadd9
  { bass: 43, notes: [55, 59, 62, 67] }, // G
];
/** The chord under second `t`: one per bar of 2 s, counted from the pad's entry. */
const chordAt = (t: number) => CHORDS[Math.floor(Math.max(0, t - T.pad) / 2) % 4]!;

const pad = new Stereo();
const bass = new Stereo();
const drums = new Stereo();
const arp = new Stereo();
const sfx = new Stereo();
const send = new Stereo();

/** Sidechain: everything melodic ducks under the kick. */
const duck = new Float32Array(LEN).fill(1);

function padLayer() {
  const bars: { t0: number; t1: number; notes: number[] }[] = [];
  for (let t = T.pad; t < T.end; t += 2) bars.push({ t0: t, t1: t + 2, notes: chordAt(t + 0.01).notes });
  // The end card resolves onto a long, open Am9.
  bars.push({ t0: T.end, t1: LEN / SR, notes: [45, 57, 64, 67, 71, 76] });
  for (const bar of bars) {
    for (const note of bar.notes) {
      for (const [det, pan] of [[-0.08, -0.7], [0, 0], [0.08, 0.7]] as const) {
        const f = mtof(note + det);
        let ph = rand();
        const i0 = s2i(bar.t0);
        const i1 = Math.min(LEN, s2i(bar.t1 + 0.8));
        for (let i = i0; i < i1; i++) {
          const t = (i - i0) / SR;
          const held = bar.t1 - bar.t0;
          const env = Math.min(1, t / 0.35) * (t > held ? Math.exp(-(t - held) / 0.25) : 1);
          ph += f / SR; if (ph >= 1) ph -= 1;
          pad.add(i, (2 * ph - 1) * env * 0.032, pan);
        }
      }
    }
  }
  const fadeIn = (t: number) => Math.min(1, Math.max(0, (t - T.pad + 0.5) / 2));
  filterBus(pad, 'lp', (t) => {
    if (t >= T.rewind && t < T.replay) return 2600 - (2300 * (t - T.rewind)) / (T.replay - T.rewind);
    if (t >= T.replay && t < T.end) return 300 + (2600 * (t - T.replay)) / (T.end - T.replay);
    return t < T.drums ? 900 + 60 * (t - T.pad) : t < T.dispatch ? 1800 : t < T.end ? 2600 : 1600;
  });
  for (let i = 0; i < LEN; i++) { const g = fadeIn(i / SR); pad.l[i]! *= g; pad.r[i]! *= g; }
}

function hats() {
  for (let t = T.hats; t < T.end - 0.01; t += BEAT / 2) {
    if (t >= T.rewind && t < T.replay) continue;
    const off = Math.round((t - T.hats) / (BEAT / 2)) % 2 === 1;
    const open = t >= T.dispatch && off && Math.round((t - T.hats) / BEAT) % 2 === 1;
    const dur = open ? 0.18 : 0.035;
    const vol = (off ? 0.11 : 0.06) * (t < T.bass ? 0.7 : 1);
    const hp = new Biquad('hp', 7000);
    const i0 = s2i(t);
    for (let i = i0; i < i0 + s2i(dur + 0.05); i++) {
      const e = Math.exp(-((i - i0) / SR) / (dur / 3));
      drums.add(i, hp.run(noise()) * e * vol, 0.25);
    }
  }
}

function kick(t: number, vol = 0.85) {
  const i0 = s2i(t);
  let ph = 0;
  for (let i = i0; i < i0 + s2i(0.45); i++) {
    const s = (i - i0) / SR;
    const f = 45 + 95 * Math.exp(-s / 0.04);
    ph += f / SR;
    drums.add(i, Math.sin(2 * Math.PI * ph) * Math.exp(-s / 0.16) * vol);
    if (i < LEN) duck[i] = Math.min(duck[i]!, 1 - 0.55 * Math.exp(-s / 0.11));
  }
}

function clap(t: number, vol = 0.26) {
  const bp = new Biquad('bp', 1500, 0.9);
  const i0 = s2i(t);
  for (let i = i0; i < i0 + s2i(0.25); i++) {
    const s = (i - i0) / SR;
    const burst = s < 0.03 ? 0.6 + 0.4 * Math.cos(s * 600) : 1;
    drums.add(i, bp.run(noise()) * Math.exp(-s / 0.07) * burst * vol);
    send.add(i, bp.run(noise()) * Math.exp(-s / 0.07) * vol * 0.3);
  }
}

function drumLayer() {
  for (let t = T.drums; t < T.end - 0.01; t += BEAT) {
    if (t >= T.rewind - 0.01 && t < T.replay) continue;
    kick(t, t < T.clap ? 0.6 : 0.72);
    const beat = Math.round((t - T.drums) / BEAT) % 4;
    if (t >= T.clap && (beat === 1 || beat === 3)) clap(t);
  }
  // Into the end card: a snare roll that speeds up out of the rewind.
  for (let t = T.replay + 0.2; t < T.end - 0.05;) {
    const p = (t - T.replay) / (T.end - T.replay);
    clap(t, 0.08 + 0.2 * p);
    t += 0.25 - 0.18 * p;
  }
}

function bassLayer() {
  for (let t = T.bass; t < T.end - 0.01; t += BEAT / 2) {
    if (t >= T.rewind && t < T.replay) continue;
    const step = Math.round((t - T.bass) / (BEAT / 2)) % 8;
    const note = chordAt(t + 0.01).bass + (step === 3 || step === 7 ? 12 : 0);
    const f = mtof(note);
    const i0 = s2i(t);
    let ph = 0;
    for (let i = i0; i < i0 + s2i(0.23); i++) {
      const s = (i - i0) / SR;
      ph += f / SR; if (ph >= 1) ph -= 1;
      const env = Math.min(1, s / 0.004) * Math.exp(-s / 0.12);
      bass.add(i, ((2 * ph - 1) * 0.6 + Math.sin(2 * Math.PI * ph) * 0.6) * env * 0.21);
    }
  }
  filterBus(bass, 'lp', (t) => (t < T.drums ? 500 : 800), 1.2);
}

function arpLayer() {
  for (let t = T.drums; t < T.end - 0.01; t += BEAT / 4) {
    if (t >= T.rewind && t < T.replay) continue;
    const step = Math.round((t - T.drums) / (BEAT / 4));
    const tones = chordAt(t + 0.01).notes;
    const pattern = [0, 1, 2, 3, 2, 1, 3, 2];
    const note = tones[pattern[step % 8]! % tones.length]! + 12;
    const f = mtof(note);
    const bright = t >= T.dispatch ? 1 : 0.7;
    const i0 = s2i(t);
    let ph = 0;
    for (let i = i0; i < i0 + s2i(0.2); i++) {
      const s = (i - i0) / SR;
      ph += f / SR; if (ph >= 1) ph -= 1;
      const tri = 1 - 4 * Math.abs(ph - 0.5);
      const v = (tri * 0.8 + (2 * ph - 1) * 0.2 * bright) * Math.exp(-s / 0.07) * 0.075;
      arp.add(i, v, step % 2 ? 0.35 : -0.35);
    }
  }
  // A dotted-eighth echo, panned wide.
  const d = s2i(0.375);
  for (let i = LEN - 1; i >= d; i--) {
    arp.l[i]! += arp.r[i - d]! * 0.32;
    arp.r[i]! += arp.l[i - d]! * 0.32;
  }
  filterBus(arp, 'lp', (t) => (t < T.dispatch ? 3200 : 5200));
}

/* ---------- sound effects ---------- */

function click(t: number, soft: boolean) {
  const i0 = s2i(t);
  const bp = new Biquad('bp', 2600 + rand() * 1800, 1.4);
  const pitch = 1500 + rand() * 600;
  const vol = soft ? 0.09 : 0.2;
  const pan = (rand() - 0.5) * 0.4;
  for (let i = i0; i < i0 + s2i(0.03); i++) {
    const s = (i - i0) / SR;
    const tick = bp.run(noise()) * Math.exp(-s / 0.004) * 2.2;
    const body = Math.sin(2 * Math.PI * pitch * s) * Math.exp(-s / 0.008) * 0.35;
    const thock = Math.sin(2 * Math.PI * 180 * s) * Math.exp(-s / 0.012) * 0.5;
    sfx.add(i, (tick + body + thock) * vol, pan);
  }
}

function tone(t: number, freq: number, dur: number, vol: number, shape: 'sine' | 'square' = 'sine', wet = 0.3) {
  const i0 = s2i(t);
  for (let i = i0; i < i0 + s2i(dur * 4); i++) {
    const s = (i - i0) / SR;
    const ph = (freq * s) % 1;
    const w = shape === 'sine' ? Math.sin(2 * Math.PI * ph) : ph < 0.5 ? 0.6 : -0.6;
    const v = w * Math.min(1, s / 0.003) * Math.exp(-s / dur) * vol;
    sfx.add(i, v);
    send.add(i, v * wet);
  }
}

function bell(t: number, note: number, vol = 0.12) {
  const f = mtof(note);
  tone(t, f, 0.5, vol);
  tone(t, f * 2, 0.25, vol * 0.4);
  tone(t, f * 3.01, 0.12, vol * 0.2);
}

function whoosh(t: number, len: number, reverse = false) {
  const bp = new Biquad('bp', 400, 1.1);
  const i0 = s2i(t);
  const n = s2i(len);
  for (let i = 0; i < n; i++) {
    const p = i / n;
    const q = reverse ? 1 - p : p;
    if (i % 64 === 0) bp.set(250 + 3200 * Math.pow(q, 1.6), 1.1);
    const env = reverse ? Math.pow(p, 2.2) * (p > 0.97 ? (1 - p) / 0.03 : 1) : Math.sin(Math.PI * Math.pow(p, 0.6));
    const v = bp.run(noise()) * env * 0.42;
    sfx.add(i0 + i, v, Math.sin(p * Math.PI * 2) * 0.5);
    send.add(i0 + i, v * 0.4);
  }
}

function impact(t: number) {
  const i0 = s2i(t);
  const hp = new Biquad('hp', 3000);
  let ph = 0;
  for (let i = i0; i < i0 + s2i(2.5); i++) {
    const s = (i - i0) / SR;
    ph += (32 + 50 * Math.exp(-s / 0.08)) / SR;
    const sub = Math.sin(2 * Math.PI * ph) * Math.exp(-s / 0.5) * 0.7;
    const crash = hp.run(noise()) * Math.exp(-s / 0.4) * 0.08;
    sfx.add(i, sub + crash);
    send.add(i, crash * 0.8);
  }
  for (const n of [57, 64, 69, 72, 76]) bell(t, n + 12, 0.07);
}

function effects() {
  // The hook: a low drone and rising air under the first keystrokes.
  for (let i = 0; i < s2i(3.2); i++) {
    const s = i / SR;
    const env = Math.min(1, s / 1.5) * (s > 2.9 ? Math.max(0, (3.2 - s) / 0.3) : 1);
    sfx.add(i, (Math.sin(2 * Math.PI * 55 * s) * 0.12 + Math.sin(2 * Math.PI * 110.3 * s) * 0.04) * env);
  }
  whoosh(1.6, 1.4);

  for (const c of cues()) {
    const t = c.f / FPS;
    switch (c.kind) {
      case 'key': click(t, !!c.soft); break;
      case 'miss': tone(t, 116, 0.08, 0.16, 'square', 0); tone(t, 110, 0.08, 0.16, 'square', 0); break;
      case 'arrive': bell(t, c.note); break;
      case 'whoosh': whoosh(t, c.len, c.reverse); break;
      case 'select': tone(t, 880, 0.05, 0.12); tone(t + 0.06, 1320, 0.08, 0.12); break;
      case 'clear': tone(t, mtof(79), 0.09, 0.12); tone(t + 0.05, mtof(86), 0.14, 0.11); break;
      case 'alert': for (const k of [0, 0.2]) { tone(t + k, 660, 0.06, 0.09, 'square'); tone(t + k + 0.1, 520, 0.06, 0.09, 'square'); } break;
      case 'fixed': [72, 76, 79, 84].forEach((n, k) => bell(t + k * 0.06, n + 12, 0.1)); break;
      case 'pluck': bell(t, c.note + 12, 0.12); break;
      case 'impact': impact(t); break;
    }
  }
}

/* ---------- mix ---------- */

padLayer();
hats();
drumLayer();
bassLayer();
arpLayer();
effects();

const mix = new Stereo();
for (let i = 0; i < LEN; i++) {
  const d = duck[i]!;
  mix.l[i] = pad.l[i]! * d + bass.l[i]! * d + arp.l[i]! * (0.6 + 0.4 * d) + drums.l[i]! + sfx.l[i]!;
  mix.r[i] = pad.r[i]! * d + bass.r[i]! * d + arp.r[i]! * (0.6 + 0.4 * d) + drums.r[i]! + sfx.r[i]!;
  send.l[i]! += pad.l[i]! * 0.5 + arp.l[i]! * 0.4;
  send.r[i]! += pad.r[i]! * 0.5 + arp.r[i]! * 0.4;
}
reverb(send, 0.55, mix);

// Gentle saturation, a fade on the last second, then peak-normalise to -1 dBFS.
let peak = 0;
for (let i = 0; i < LEN; i++) {
  const fade = Math.min(1, (LEN - i) / SR);
  mix.l[i] = Math.tanh(mix.l[i]! * 1.3) * fade;
  mix.r[i] = Math.tanh(mix.r[i]! * 1.3) * fade;
  peak = Math.max(peak, Math.abs(mix.l[i]!), Math.abs(mix.r[i]!));
}
const gain = 0.89 / peak;

const wav = Buffer.alloc(44 + LEN * 4);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + LEN * 4, 4); wav.write('WAVE', 8);
wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(LEN * 4, 40);
for (let i = 0; i < LEN; i++) {
  wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, mix.l[i]! * gain)) * 32767), 44 + i * 4);
  wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, mix.r[i]! * gain)) * 32767), 46 + i * 4);
}
const out = join(import.meta.dirname, '..', 'public', 'soundtrack.wav');
writeFileSync(out, wav);
console.log(`Wrote ${out} (${(LEN / SR).toFixed(1)} s, peak gain ${gain.toFixed(2)})`);
