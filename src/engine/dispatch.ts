import { FULL_NETWORK_ESCALATION, OOS_FAIL_SHARE, PLATFORM_CAPACITY, SHIFT_PHASES, TICK_MS, type ShiftFlow } from './dispatchBalance';
import { applyExpansion, drawOffers, eraFor, servedStations, STARTING_NETWORK, type Expansion, type Served } from './dispatchNetwork';
import { advanceFix, stepWorld } from './dispatchIncidents';
import { clearSignal, cloneSim, crowdAt, skipSignal, startShiftSim, type OosCause, type SimState } from './dispatchSim';
import { aimKey, EMPTY_AIM, reconcileAim, sameRef, visibleTargets, type Aim, type TargetRef } from './dispatchTargets';
import { computeMetrics, type Metrics } from './metrics';
import type { NetworkIndex } from './network';
import { seedRandom } from './rng';
import { isPrintable } from './typing';

export type CareerStatus = 'ready' | 'running' | 'paused' | 'between' | 'ended';
export type CareerEnd = 'failed' | 'abandoned';
export interface ShiftRecord { shift: number; delivered: number; calls: number; onTimeCalls: number; cleared: boolean }
export interface Closure { station: string; cause: OosCause }
/** A failed Shift's closures in the order they happened; the first started the collapse. */
export interface Failure { shift: number; closures: Closure[] }
export interface CareerState {
  seed: number; status: CareerStatus; endReason: CareerEnd | null; failure: Failure | null;
  startedAt: number | null; stoppedAt: number | null; pausedMs: number; endedAt: number | null;
  gameMs: number; shiftStartMs: number; shift: number; cleared: number; served: Served;
  offers: Expansion[]; offerRng: number; filledAt: number | null; sim: SimState; aim: Aim;
  history: ShiftRecord[]; correctChars: number; keystrokes: number; errors: number;
}

export const SHIFT_MS = SHIFT_PHASES.reduce((sum, phase) => sum + phase.ms, 0);
export interface ShiftPhase { name: string; flow: ShiftFlow; multiplier: number; trainFactor: number; progress: number }

export function shiftPhase(shiftMs: number): ShiftPhase {
  let within = Math.max(0, shiftMs);
  for (const phase of SHIFT_PHASES) {
    if (within < phase.ms) return { name: phase.name, flow: phase.flow,
      multiplier: phase.multiplier, trainFactor: phase.trainFactor, progress: within / phase.ms };
    within -= phase.ms;
  }
  const last = SHIFT_PHASES[SHIFT_PHASES.length - 1]!;
  return { name: last.name, flow: last.flow, multiplier: last.multiplier,
    trainFactor: last.trainFactor, progress: 1 };
}

export function shiftEscalation(s: CareerState): number {
  return s.filledAt === null ? 1 : 1 + FULL_NETWORK_ESCALATION * (s.shift - s.filledAt);
}

export function startCareer(net: NetworkIndex, seed: number): CareerState {
  const served = STARTING_NETWORK.map((range) => ({ ...range }));
  return {
    seed, status: 'ready', endReason: null, failure: null, startedAt: null, stoppedAt: null,
    pausedMs: 0, endedAt: null, gameMs: 0, shiftStartMs: 0, shift: 1, cleared: 0,
    served, offers: [], offerRng: seedRandom(seed), filledAt: null,
    sim: startShiftSim(net, served, seedRandom(seed)), aim: { ...EMPTY_AIM }, history: [],
    correctChars: 0, keystrokes: 0, errors: 0,
  };
}

function dispatchPrintable(key: string): boolean {
  if (!isPrintable(key) || key.length !== 1) return false;
  const code = key.charCodeAt(0);
  return code >= 32 && (code < 127 || code > 159);
}

function aimIsEmpty(aim: Aim): boolean {
  return aim.typed === '' && aim.lock === null && !aim.mistyped && aim.stallUntil === 0;
}

function record(s: CareerState, cleared: boolean): ShiftRecord {
  return { shift: s.shift, delivered: s.sim.delivered, calls: s.sim.calls,
    onTimeCalls: s.sim.onTimeCalls, cleared };
}

function cloneCareer(s: CareerState): CareerState {
  return {
    ...s, served: s.served.map((range) => ({ ...range })),
    offers: s.offers.map((offer) => ({ ...offer, added: [...offer.added] })),
    sim: cloneSim(s.sim), aim: { ...s.aim, lock: s.aim.lock ? { ...s.aim.lock } : null },
    history: s.history.map((entry) => ({ ...entry })),
  };
}

/** Advance only whole simulation ticks, stopping at the first Shift boundary or failure. */
export function advanceCareer(net: NetworkIndex, state: CareerState, now: number): CareerState {
  if (state.status !== 'running' || state.startedAt === null) return state;
  const target = now - state.startedAt - state.pausedMs;
  if (state.gameMs + TICK_MS > target) return state;
  const s = cloneCareer(state);
  const failCount = Math.ceil(OOS_FAIL_SHARE * servedStations(net, s.served).length);
  while (s.status === 'running' && s.gameMs + TICK_MS <= target) {
    const phase = shiftPhase(s.gameMs - s.shiftStartMs);
    stepWorld(net, s.sim, { multiplier: phase.multiplier, flow: phase.flow,
      trainFactor: phase.trainFactor, escalation: shiftEscalation(s) });
    s.gameMs += TICK_MS;
    s.aim = reconcileAim(visibleTargets(net, s.sim), s.aim);
    if (s.sim.oosOrder.length >= failCount) {
      s.status = 'ended'; s.endReason = 'failed';
      s.failure = { shift: s.shift,
        closures: s.sim.oosOrder.map((station) => ({ station, cause: s.sim.outOfService[station]! })) };
      s.endedAt = s.startedAt! + s.pausedMs + s.gameMs;
      s.history.push(record(s, false));
      break;
    }
    if (s.gameMs - s.shiftStartMs >= SHIFT_MS) {
      s.cleared++;
      s.history.push(record(s, true));
      [s.offers, s.offerRng] = drawOffers(net, s.served, eraFor(s.cleared), s.offerRng);
      if (s.offers.length === 0 && s.filledAt === null) s.filledAt = s.shift;
      s.status = 'between';
      s.stoppedAt = s.startedAt! + s.pausedMs + s.gameMs;
    }
  }
  return s;
}

function completeTarget(net: NetworkIndex, sim: SimState, ref: TargetRef, text: string): void {
  if (ref.kind === 'fix') advanceFix(net, sim, ref.incident);
  else if (ref.kind === 'signal') clearSignal(net, sim, ref.train);
  else {
    const train = sim.trains.find((candidate) => candidate.id === ref.train);
    if (!train) return;
    const toIndex = net.lines.get(train.line)!.stations.findIndex((id) => net.stations.get(id)!.name === text);
    skipSignal(net, sim, ref.train, toIndex);
  }
}

function applyTargetKey(net: NetworkIndex, state: CareerState, key: string): CareerState {
  const targets = visibleTargets(net, state.sim);
  const outcome = aimKey(targets, state.aim, key, state.gameMs);
  if (!outcome.counted && !outcome.completed) return state;
  const s = { ...state, aim: outcome.aim,
    correctChars: state.correctChars + Number(outcome.correct),
    keystrokes: state.keystrokes + Number(outcome.counted),
    errors: state.errors + Number(outcome.counted && !outcome.correct) };
  if (outcome.completed) {
    const target = targets.find((item) => sameRef(item.ref, outcome.completed!));
    s.sim = cloneSim(state.sim);
    completeTarget(net, s.sim, outcome.completed, target?.text ?? '');
    s.aim = reconcileAim(visibleTargets(net, s.sim), s.aim);
  }
  return s;
}

/** The first printable key starts the Career and is applied immediately. */
export function enterDispatchCharacter(net: NetworkIndex, state: CareerState, key: string, now: number): CareerState {
  if (state.status === 'ready') {
    if (!dispatchPrintable(key)) return state;
    const startedAt = state.startedAt ?? now;
    const pausedMs = state.stoppedAt === null ? state.pausedMs : state.pausedMs + Math.max(0, now - state.stoppedAt);
    return applyTargetKey(net, { ...state, status: 'running', startedAt, pausedMs, stoppedAt: null }, key);
  }
  const synced = advanceCareer(net, state, now);
  if (synced.status !== 'running' || !dispatchPrintable(key)) return synced;
  return applyTargetKey(net, synced, key);
}

export type DispatchActionBody = { a: 'unlock' } | { a: 'expand'; pick: number } | { a: 'pause' }
  | { a: 'resume' } | { a: 'abandon' } | { a: 'confirm' };
export type DispatchAction = DispatchActionBody & { i: number; t: number };
export const DISPATCH_EVIDENCE_VERSION = 1;

/** Refused actions retain input identity so the recorder can omit them. */
export function applyDispatchAction(net: NetworkIndex, state: CareerState, action: DispatchActionBody, now: number): CareerState {
  switch (action.a) {
    case 'unlock': {
      if (state.status !== 'running' || aimIsEmpty(state.aim)) return state;
      const synced = advanceCareer(net, state, now);
      if (synced.status !== 'running' || aimIsEmpty(synced.aim)) return state;
      return { ...synced, aim: { ...EMPTY_AIM } };
    }
    case 'confirm': {
      if (state.status !== 'running') return state;
      const synced = advanceCareer(net, state, now);
      if (synced.status !== 'running') return state;
      const result = applyTargetKey(net, synced, 'Enter');
      return result === synced ? state : result;
    }
    case 'pause': {
      if (state.status !== 'running') return state;
      const synced = advanceCareer(net, state, now);
      return synced.status === 'running' ? { ...synced, status: 'paused', stoppedAt: now } : state;
    }
    case 'resume':
      return state.status === 'paused' && state.stoppedAt !== null
        ? { ...state, status: 'running', pausedMs: state.pausedMs + Math.max(0, now - state.stoppedAt), stoppedAt: null }
        : state;
    case 'expand': {
      if (state.status !== 'between' || !Number.isInteger(action.pick)
        || (action.pick === -1 ? state.offers.length !== 0
          : action.pick < 0 || action.pick >= state.offers.length)) return state;
      const served = action.pick === -1 ? state.served.map((range) => ({ ...range }))
        : applyExpansion(state.served, state.offers[action.pick]!);
      return { ...state, status: 'ready', shift: state.shift + 1, shiftStartMs: state.gameMs,
        served, offers: [], sim: startShiftSim(net, served, state.sim.rng), aim: { ...EMPTY_AIM } };
    }
    case 'abandon': {
      if (state.startedAt === null || state.status === 'ended') return state;
      const synced = advanceCareer(net, state, now);
      if (synced.status === 'ended') return state;
      const history = synced.history.some((entry) => entry.shift === synced.shift)
        ? synced.history : [...synced.history, record(synced, false)];
      return { ...synced, status: 'ended', endReason: 'abandoned', endedAt: now, history };
    }
  }
}

export function careerMetrics(s: CareerState, now: number): Metrics {
  const elapsed = s.status === 'running' && s.startedAt !== null
    ? Math.max(s.gameMs, now - s.startedAt - s.pausedMs) : s.gameMs;
  return computeMetrics(s.correctChars, s.keystrokes, elapsed);
}

export function careerTotals(s: CareerState): { delivered: number; calls: number; onTimeCalls: number; onTimePct: number } {
  const totals = { delivered: 0, calls: 0, onTimeCalls: 0, onTimePct: 0 };
  for (const item of s.history) {
    totals.delivered += item.delivered;
    totals.calls += item.calls;
    totals.onTimeCalls += item.onTimeCalls;
  }
  if (!s.history.some((item) => item.shift === s.shift)) {
    totals.delivered += s.sim.delivered;
    totals.calls += s.sim.calls;
    totals.onTimeCalls += s.sim.onTimeCalls;
  }
  totals.onTimePct = totals.calls > 0 ? 100 * totals.onTimeCalls / totals.calls : 100;
  return totals;
}

export function careerScore(s: CareerState): number {
  return Math.round(careerTotals(s).delivered * computeMetrics(s.correctChars, s.keystrokes, s.gameMs).accuracy);
}

/** True while any Incident is active, or any platform is over half of PLATFORM_CAPACITY. */
export function dispatchTense(s: CareerState): boolean {
  return s.sim.incidents.length > 0
    || Object.keys(s.sim.platforms).some((id) => crowdAt(s.sim, id) > PLATFORM_CAPACITY / 2);
}
