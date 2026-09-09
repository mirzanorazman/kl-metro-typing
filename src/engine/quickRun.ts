import type { LineCode } from '../data/types';
import { lineAt, stationAt, type NetworkIndex } from './network';
import { beginTyping, type TypingState } from './typing';

export const QUICK_RUN_MS = 45_000;

export type QuickRunStatus = 'ready' | 'running' | 'completed' | 'interrupted';

export interface QuickStationTime {
  id: string;
  ms: number;
}

export interface QuickRunState {
  line: LineCode;
  /** Terminus station id selected as the run's destination. */
  initialToward: string;
  direction: -1 | 1;
  at: string;
  arrivedFrom: string | null;
  typing: TypingState;
  completedStations: QuickStationTime[];
  startedAt: number | null;
  stationStartedAt: number | null;
  deadline: number | null;
  endedAt: number | null;
  correctChars: number;
  keystrokes: number;
  errors: number;
  status: QuickRunStatus;
}

export function prepareQuickRun(
  net: NetworkIndex,
  lineCode: LineCode,
  toward: string,
  previousStart: string | null,
  random: () => number = Math.random,
): QuickRunState {
  const line = lineAt(net, lineCode);
  if (!line || line.stations.length < 2) {
    throw new Error('Quick Run needs a valid Line');
  }

  const first = line.stations[0]!;
  const last = line.stations[line.stations.length - 1]!;
  if (toward !== first && toward !== last) {
    throw new Error('Quick Run destination must be a terminus');
  }

  const allCandidates = line.stations.filter((id) => id !== toward);
  const alternatives = allCandidates.filter((id) => id !== previousStart);
  const candidates = alternatives.length > 0 ? alternatives : allCandidates;
  const rawIndex = Math.floor(random() * candidates.length);
  const index = Number.isFinite(rawIndex)
    ? Math.max(0, Math.min(candidates.length - 1, rawIndex))
    : 0;
  const at = candidates[index]!;
  const station = stationAt(net, at);
  if (!station) {
    throw new Error(`Quick Run starting station not found: ${at}`);
  }

  return {
    line: lineCode,
    initialToward: toward,
    direction: toward === last ? 1 : -1,
    at,
    arrivedFrom: null,
    typing: beginTyping(station.name),
    completedStations: [],
    startedAt: null,
    stationStartedAt: null,
    deadline: null,
    endedAt: null,
    correctChars: 0,
    keystrokes: 0,
    errors: 0,
    status: 'ready',
  };
}

export function quickRunToward(net: NetworkIndex, state: QuickRunState): string {
  const line = lineAt(net, state.line);
  if (!line) return '';
  return line.termini[state.direction === 1 ? 1 : 0];
}
