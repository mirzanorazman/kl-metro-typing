import type { Point } from '../../src/data/types';
import { LINES, along, pos } from './net';
import { SCENE, TYPE, WIDTH, completedEased, easeInOut, ramp } from './timeline';

/** A view of the map: the world point at the focus, and a zoom over the base scale. */
export interface Cam {
  x: number;
  y: number;
  z: number;
}

/** World units (the app's 1000 × 800 viewport) to pixels at zoom 1. */
const BASE = 1.04;
/** The map's focus sits between the headline band and the typing panel. */
export const FOCUS_Y = 930;

export function toScreen(p: Point, cam: Cam): Point {
  return {
    x: (p.x - cam.x) * BASE * cam.z + WIDTH / 2,
    y: (p.y - cam.y) * BASE * cam.z + FOCUS_Y,
  };
}

/** Frames the given points in a box of `w` × `h` pixels around the focus. */
function fit(points: Point[], w: number, h: number, maxZ = 8): Cam {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const z = Math.min(w / (x1 - x0 || 1), h / (y1 - y0 || 1), maxZ * BASE) / BASE;
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z };
}

const range = (code: keyof typeof LINES, a: number, b: number) =>
  LINES[code].stations.slice(a, b + 1).map(pos);

const ALL = Object.values(LINES).flatMap((l) => l.stations.map(pos));
const NINETIES = [...range('KJ', 0, 23), ...range('AG', 0, 17), ...range('SP', 0, 17)];

const VIEW = {
  all: fit(ALL, 1000, 740),
  nineties: fit(NINETIES, 900, 780),
  monorail: fit(range('MR', 0, 10), 700, 640),
  southWest: fit([...range('KJ', 23, 36), ...range('SP', 17, 28)], 860, 720),
  kajang: fit([...range('KG', 0, 28), pos('putra-heights')], 980, 860),
  putrajaya: fit(range('PY', 0, 35), 960, 860),
  city: fit(['kl-sentral', 'pasar-seni', 'bukit-bintang', 'maluri', 'titiwangsa', 'semantan', 'pandan-jaya'].map(pos), 940, 760),
  maluri: { ...pos('maluri'), z: 6 },
};

interface Shot {
  at: number;
  /** Frames to blend in from the previous shot. */
  blend: number;
  cam: (f: number) => Cam;
}

const still = (c: Cam) => () => c;

const SHOTS: Shot[] = [
  { at: SCENE.hook, blend: 0, cam: (f) => ({ ...pos('gombak'), z: ramp(f, 0, 100, 8, 6.6) }) },
  {
    at: 70, blend: 40,
    cam: (f) => ({ ...along('KJ', completedEased(TYPE.core, f, 14) + 0.5), z: 6 }),
  },
  { at: 236, blend: 40, cam: still(VIEW.nineties) },
  { at: 270, blend: 24, cam: (f) => ({ ...VIEW.monorail, z: VIEW.monorail.z * ramp(f, 270, 390, 1, 1.08) }) },
  { at: 384, blend: 34, cam: still(VIEW.southWest) },
  { at: 456, blend: 80, cam: still(VIEW.kajang) },
  { at: 538, blend: 22, cam: still(VIEW.putrajaya) },
  {
    at: 586, blend: 18,
    cam: (f) => ({ ...along('PY', 28.6 + completedEased(TYPE.quickRun, f, 14)), z: 5.2 }),
  },
  { at: 680, blend: 40, cam: (f) => ({ ...VIEW.all, z: VIEW.all.z * ramp(f, 680, 780, 1, 1.03) }) },
  { at: 776, blend: 32, cam: still(VIEW.city) },
  { at: 900, blend: 26, cam: still(VIEW.maluri) },
  { at: 986, blend: 26, cam: (f) => ({ ...VIEW.all, z: VIEW.all.z * ramp(f, 986, 1200, 1, 0.94, (t) => t) }) },
];

export function cameraAt(f: number): Cam {
  let i = 0;
  while (i + 1 < SHOTS.length && SHOTS[i + 1]!.at <= f) i++;
  const shot = SHOTS[i]!;
  const cur = shot.cam(f);
  if (i === 0 || f >= shot.at + shot.blend) return cur;
  const prev = SHOTS[i - 1]!.cam(f);
  const t = easeInOut((f - shot.at) / shot.blend);
  return {
    x: prev.x + (cur.x - prev.x) * t,
    y: prev.y + (cur.y - prev.y) * t,
    z: Math.exp(Math.log(prev.z) + (Math.log(cur.z) - Math.log(prev.z)) * t),
  };
}

