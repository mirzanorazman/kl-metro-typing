import { TICK_MS } from './dispatchBalance';
import { applyTargetKey, startCareer, type CareerState } from './dispatch';
import { cloneSim, startShiftSim, stepSim, type PhaseNow, type Train } from './dispatchSim';
import { backspaceAim, reconcileAim, visibleTargets } from './dispatchTargets';
import type { NetworkIndex } from './network';

/** The id stored in `dispatchTipsSeen` once the lesson has been finished or skipped. */
export const LESSON_SEEN = 'lesson';
/** The two Stations the lesson's train waits for, in order. */
export const LESSON_NAMES = ['Jelatek', 'Setiawangsa'] as const;
export type LessonStep = 'first' | 'moving' | 'second' | 'done';
/**
 * `career` is a throwaway state the overlay can draw. Step it only through this module:
 * `advanceCareer` and `applyDispatchAction` run the real Shift phases.
 */
export interface Lesson { career: CareerState; step: LessonStep; clockAt: number }

/** Sri Rampai to Dato' Keramat, so Setiawangsa's Signal is an ordinary one, not the stretch's end. */
const STRETCH = { line: 'KJ' as const, from: 3, to: 6 };
/** No passengers, no Incidents, and `trainFactor: 0` keeps the fleet at the one train. */
const QUIET: PhaseNow = { multiplier: 0, flow: 'none', trainFactor: 0, escalation: 1 };

function kjIds(net: NetworkIndex): string[] {
  return net.lines.get('KJ')!.stations;
}

function indexOfName(net: NetworkIndex, name: string): number {
  return kjIds(net).findIndex((id) => net.stations.get(id)!.name === name);
}

/** One KJ train waiting at the Signal before Jelatek, in a state `advanceLesson` can step. */
export function startLesson(net: NetworkIndex, now: number): Lesson {
  const base = startCareer(net, 0);
  const sim = startShiftSim(net, [STRETCH], 0);
  const train: Train = { id: 1, line: 'KJ', dir: -1, at: indexOfName(net, LESSON_NAMES[0]),
    stage: 'signal', ms: 0, skipTo: null, load: {}, lastExchange: null };
  sim.trains = [train];
  sim.nextTrainId = 2;
  const career: CareerState = { ...base, served: [{ ...STRETCH }], sim, status: 'running', startedAt: now };
  return { career, step: 'first', clockAt: now };
}

/** Dato' Keramat, Jelatek and Setiawangsa: the camera frame. */
export function lessonStations(net: NetworkIndex): string[] {
  const ids = kjIds(net);
  return [6, 5, 4].map((index) => ids[index]!);
}

/** Step whole ticks up to `now`; the second Signal appears once the train has reached it. */
export function advanceLesson(net: NetworkIndex, lesson: Lesson, now: number): Lesson {
  const target = now - lesson.clockAt;
  if (lesson.career.gameMs + TICK_MS > target) return lesson;
  const career: CareerState = { ...lesson.career, sim: cloneSim(lesson.career.sim) };
  while (career.gameMs + TICK_MS <= target) {
    stepSim(net, career.sim, QUIET);
    career.gameMs += TICK_MS;
    career.aim = reconcileAim(visibleTargets(net, career.sim), career.aim);
  }
  const arrived = lesson.step === 'moving'
    && visibleTargets(net, career.sim).some((t) => t.text === LESSON_NAMES[1]);
  return { ...lesson, career, step: arrived ? 'second' : lesson.step };
}

/** Types one key (printable, or `'Enter'`); clearing the waiting Signal moves the lesson on. */
export function lessonKey(net: NetworkIndex, lesson: Lesson, key: string, now: number): Lesson {
  const synced = advanceLesson(net, lesson, now);
  if (synced.step !== 'first' && synced.step !== 'second') return synced;
  const career = applyTargetKey(net, synced.career, key);
  const left = career.sim.trains.some((t) => t.stage !== 'signal');
  return { ...synced, career, step: left ? (synced.step === 'first' ? 'moving' : 'done') : synced.step };
}

/** Backspace undoes one key, as in a Shift. */
export function lessonBackspace(net: NetworkIndex, lesson: Lesson, now: number): Lesson {
  const synced = advanceLesson(net, lesson, now);
  const targets = visibleTargets(net, synced.career.sim);
  const aim = backspaceAim(targets, reconcileAim(targets, synced.career.aim)) ?? synced.career.aim;
  return { ...synced, career: { ...synced.career, aim } };
}
