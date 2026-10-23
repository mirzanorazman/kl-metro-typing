import type { LineCode } from '../data/types';
import {
  BUNCH_BLOCKS, DWELL_BASE_MS, STATIONS_PER_TRAIN, TICK_MS, TRAVEL_MS, TURNAROUND_MS,
  type ShiftFlow,
} from './dispatchBalance';
import type { Served, ServedRange } from './dispatchNetwork';
import type { NetworkIndex } from './network';

export type Dir = 1 | -1;
export type TrainStage = 'signal' | 'cleared' | 'dwell' | 'running' | 'turnaround';

export interface Train {
  id: number;
  line: LineCode;
  dir: Dir;
  /** Approached Station for signal/cleared, current for dwell/turnaround, departed for running. */
  at: number;
  stage: TrainStage;
  /** Elapsed block time, remaining dwell/turnaround time, or time Held at a Signal. */
  ms: number;
  skipTo: number | null;
  load: Record<string, number>;
}

export interface SimState {
  served: Served;
  trains: Train[];
  nextTrainId: number;
  rng: number;
  shiftMs: number;
}

export interface PhaseNow {
  multiplier: number;
  flow: ShiftFlow;
  trainFactor: number;
  escalation: number;
}

/** Physical directed track, shared by Lines such as AG and SP. */
export function blockKey(net: NetworkIndex, line: LineCode, fromIndex: number, toIndex: number): string {
  const stations = net.lines.get(line)!.stations;
  return `${stations[fromIndex]!}>${stations[toIndex]!}`;
}

export function trainsForLine(range: ServedRange, trainFactor: number): number {
  return Math.max(1, Math.round(Math.max(2, Math.round((range.to - range.from + 1) / STATIONS_PER_TRAIN)) * trainFactor));
}

/** Terminal turnaround replaces base dwell; intermediate Stations are called in both directions. */
export function targetHeadwayMs(range: ServedRange): number {
  const blocks = range.to - range.from;
  const cycleMs = 2 * blocks * TRAVEL_MS + 2 * Math.max(0, blocks - 1) * DWELL_BASE_MS + 2 * TURNAROUND_MS;
  return cycleMs / trainsForLine(range, 1);
}

function occupiedBlock(net: NetworkIndex, t: Train): string | null {
  if (t.stage === 'dwell' || t.stage === 'turnaround') return null;
  return t.stage === 'running'
    ? blockKey(net, t.line, t.at, t.at + t.dir)
    : blockKey(net, t.line, t.at - t.dir, t.at);
}

function blockFree(net: NetworkIndex, s: SimState, line: LineCode, from: number, to: number): boolean {
  const key = blockKey(net, line, from, to);
  return !s.trains.some((t) => occupiedBlock(net, t) === key);
}

function platformFree(net: NetworkIndex, s: SimState, line: LineCode, at: number, dir: Dir): boolean {
  const id = net.lines.get(line)!.stations[at]!;
  return !s.trains.some((t) => (t.stage === 'dwell' || t.stage === 'turnaround')
    && t.dir === dir && net.lines.get(t.line)!.stations[t.at] === id);
}

function addTrain(s: SimState, line: LineCode, at: number, dir: Dir, stage: TrainStage, ms: number): void {
  s.trains.push({ id: s.nextTrainId++, line, at, dir, stage, ms, skipTo: null, load: {} });
}

export function startShiftSim(net: NetworkIndex, served: Served, rng: number): SimState {
  const s: SimState = {
    served: served.map((r) => ({ ...r })), trains: [], nextTrainId: 1, rng, shiftMs: 0,
  };
  for (const range of s.served) {
    const blocks = range.to - range.from;
    const slots = 2 * blocks;
    const count = trainsForLine(range, 1);
    for (let i = 0; i < count; i++) {
      // Start evenly around the out-and-back route. Shared-track collisions move
      // to the next free block; fleets that cannot fit reinforce on later ticks.
      for (let offset = 0; offset < slots; offset++) {
        const slot = (Math.floor(i * slots / count) + offset) % slots;
        const dir: Dir = slot < blocks ? 1 : -1;
        const at = dir === 1 ? range.from + slot + 1 : range.to - (slot - blocks) - 1;
        if (!blockFree(net, s, range.line, at - dir, at)) continue;
        addTrain(s, range.line, at, dir, 'signal', 0);
        break;
      }
    }
  }
  return s;
}

export function clearSignal(_net: NetworkIndex, s: SimState, trainId: number): boolean {
  const t = s.trains.find((candidate) => candidate.id === trainId);
  if (!t || t.stage !== 'signal') return false;
  t.stage = 'cleared';
  t.ms = 0;
  return true;
}

/** Advances one fixed tick in array order, reserving every move before the next Train moves. */
export function stepSim(net: NetworkIndex, s: SimState, phase: PhaseNow): void {
  s.shiftMs += TICK_MS;
  for (const t of [...s.trains]) {
    const range = s.served.find((r) => r.line === t.line)!;
    switch (t.stage) {
      case 'signal':
        t.ms += TICK_MS;
        break;
      case 'cleared':
        if (!platformFree(net, s, t.line, t.at, t.dir)) break;
        if ((t.dir === 1 && t.at === range.to) || (t.dir === -1 && t.at === range.from)) {
          t.stage = 'turnaround';
          t.ms = TURNAROUND_MS;
        } else {
          t.stage = 'dwell';
          t.ms = DWELL_BASE_MS;
        }
        break;
      case 'dwell':
        t.ms = Math.max(0, t.ms - TICK_MS);
        if (t.ms === 0 && blockFree(net, s, t.line, t.at, t.at + t.dir)) {
          t.stage = 'running';
        }
        break;
      case 'running':
        t.ms += TICK_MS;
        if (t.ms >= TRAVEL_MS) {
          t.at += t.dir;
          t.stage = 'signal';
          t.ms = 0;
        }
        break;
      case 'turnaround': {
        const count = s.trains.filter((candidate) => candidate.line === t.line).length;
        if (count > trainsForLine(range, phase.trainFactor)) {
          s.trains.splice(s.trains.indexOf(t), 1);
          break;
        }
        t.ms = Math.max(0, t.ms - TICK_MS);
        const dir: Dir = t.dir === 1 ? -1 : 1;
        if (t.ms === 0 && blockFree(net, s, t.line, t.at, t.at + dir)) {
          t.dir = dir;
          t.stage = 'running';
        }
        break;
      }
    }
  }

  for (const range of s.served) {
    const desired = trainsForLine(range, phase.trainFactor);
    for (const dir of [1, -1] as const) {
      if (s.trains.filter((t) => t.line === range.line).length >= desired) break;
      const at = dir === 1 ? range.from : range.to;
      if (range.from === range.to || !platformFree(net, s, range.line, at, dir)
        || !blockFree(net, s, range.line, at, at + dir)) continue;
      addTrain(s, range.line, at, dir, 'dwell', DWELL_BASE_MS);
    }
  }
}

export function cloneSim(s: SimState): SimState {
  return {
    ...s,
    served: s.served.map((r) => ({ ...r })),
    trains: s.trains.map((t) => ({ ...t, load: { ...t.load } })),
  };
}

export function trainPosition(net: NetworkIndex, t: Train): { from: string; to: string; t: number } {
  const stations = net.lines.get(t.line)!.stations;
  return t.stage === 'running'
    ? { from: stations[t.at]!, to: stations[t.at + t.dir]!, t: Math.max(0, Math.min(1, t.ms / TRAVEL_MS)) }
    : { from: stations[t.at]!, to: stations[t.at]!, t: 0 };
}

export function bunchedTrains(net: NetworkIndex, s: SimState): Set<number> {
  const bunched = new Set<number>();
  const positions = s.trains.map((t) => {
    const position = trainPosition(net, t);
    return t.at + (t.stage === 'running' ? t.dir * position.t : 0);
  });
  for (let i = 0; i < s.trains.length; i++) {
    const a = s.trains[i]!;
    for (let j = i + 1; j < s.trains.length; j++) {
      const b = s.trains[j]!;
      if (a.line !== b.line || a.dir !== b.dir || Math.abs(positions[i]! - positions[j]!) > BUNCH_BLOCKS) continue;
      bunched.add(a.id);
      bunched.add(b.id);
    }
  }
  return bunched;
}
