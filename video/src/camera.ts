import type { Point } from '../../src/data/types';
import { LINES, along, pos } from './net';
import { CORE_END, DISPATCH, DURATION, SCENE, TYPE, WIDTH, completedEased, easeInOut, ramp } from './timeline';

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
  { at: CORE_END - 6, blend: 44, cam: still(VIEW.nineties) },
  // Breath into 2003: the camera glides to the city on its own.
  { at: 316, blend: 44, cam: (f) => ({ ...VIEW.monorail, z: VIEW.monorail.z * ramp(f, 316, SCENE.breathB, 1, 1.08) }) },
  // Breath into 2015–17: south-west, while the extensions reach Putra Heights.
  { at: SCENE.breathB + 2, blend: 50, cam: still(VIEW.southWest) },
  { at: 698, blend: 72, cam: still(VIEW.kajang) },
  // Breath into 2022–23: pull back as the Putrajaya Line sweeps south.
  { at: 772, blend: 30, cam: still(VIEW.putrajaya) },
  {
    at: 826, blend: 20,
    cam: (f) => ({ ...along('PY', 28.6 + completedEased(TYPE.quickRun, f, 14)), z: 5.2 }),
  },
  { at: 946, blend: 40, cam: (f) => ({ ...VIEW.all, z: VIEW.all.z * ramp(f, 946, SCENE.dispatcher + 60, 1, 1.03) }) },
  // Dispatcher: the whole board comes alive, then the camera leans into the city.
  { at: DISPATCH.entrance[1] - 6, blend: 34, cam: still(VIEW.city) },
  { at: DISPATCH.incidentAt - 6, blend: 28, cam: still(VIEW.maluri) },
  { at: 1344, blend: 30, cam: (f) => ({ ...VIEW.all, z: VIEW.all.z * ramp(f, 1344, DURATION, 1, 0.94, (t) => t) }) },
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

