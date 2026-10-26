import type { IncidentKind } from '../engine/dispatchSim';

/** A circle as a path, for cutting lamp holes or drawing heads. */
function circle(cx: number, cy: number, r: number): string {
  return `M${cx - r},${cy} A${r},${r} 0 1 0 ${cx + r},${cy} A${r},${r} 0 1 0 ${cx - r},${cy} Z`;
}

/**
 * One glyph per Incident kind, in a -1..1 box, drawn with `fill-rule:
 * evenodd`. The shapes differ, so the kinds never rely on colour: a signal
 * head on its post, a Train's front, a crowd of three, and two Trains in
 * profile nose to tail.
 */
export const INCIDENT_GLYPH: Record<IncidentKind, string> = {
  'signal-fault': [
    'M-0.45,-1 H0.45 V0.4 H-0.45 Z',
    circle(0, -0.6, 0.2),
    circle(0, 0, 0.2),
    'M-0.1,0.4 H0.1 V1 H-0.1 Z',
  ].join(' '),
  'train-fault': [
    'M-0.7,-0.95 H0.7 A0.15,0.15 0 0 1 0.85,-0.8 V0.55 H-0.85 V-0.8 A0.15,0.15 0 0 1 -0.7,-0.95 Z',
    'M-0.6,-0.7 H0.6 V-0.1 H-0.6 Z',
    'M-0.6,0.55 H-0.25 V0.95 H-0.6 Z',
    'M0.25,0.55 H0.6 V0.95 H0.25 Z',
  ].join(' '),
  'crowd-surge': [
    circle(-0.62, -0.25, 0.2),
    'M-0.9,0.85 V0.3 A0.28,0.28 0 0 1 -0.34,0.3 V0.85 Z',
    circle(0, -0.5, 0.22),
    'M-0.28,0.85 V0.1 A0.28,0.28 0 0 1 0.28,0.1 V0.85 Z',
    circle(0.62, -0.25, 0.2),
    'M0.34,0.85 V0.3 A0.28,0.28 0 0 1 0.9,0.3 V0.85 Z',
  ].join(' '),
  'service-gap': [
    'M-1,-0.45 H-0.3 A0.25,0.25 0 0 1 -0.05,-0.2 V0.45 H-1 Z',
    'M-0.85,-0.25 H-0.35 V0 H-0.85 Z',
    'M0.05,-0.45 H0.75 A0.25,0.25 0 0 1 1,-0.2 V0.45 H0.05 Z',
    'M0.2,-0.25 H0.7 V0 H0.2 Z',
    'M-0.95,0.6 H0.95 V0.75 H-0.95 Z',
  ].join(' '),
};
