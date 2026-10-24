import { describe, expect, it } from 'vitest';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from './network';
import { visibleTargets } from './dispatchTargets';
import { advanceLesson, lessonBackspace, lessonKey, lessonStations, startLesson, type Lesson } from './dispatchLesson';

const net = buildNetwork(loadNetworkData());
const names = (l: Lesson) => visibleTargets(net, l.career.sim).map((t) => t.text);
const typeAll = (l: Lesson, text: string, now: number) => [...text].reduce((s, k) => lessonKey(net, s, k, now), l);

describe('the Dispatcher lesson', () => {
  it('starts with one KJ train waiting at the signal for Jelatek, and nothing else', () => {
    const l = startLesson(net, 1_000);
    expect(l.step).toBe('first');
    expect(names(l)).toEqual(['Jelatek']);
    expect(l.career.sim.trains).toHaveLength(1);
    expect(l.career.sim.incidents).toEqual([]);
  });

  it('typing Jelatek sends the train on, and it waits again for Setiawangsa', () => {
    let l = typeAll(startLesson(net, 1_000), 'Jelatek', 1_000);
    expect(l.step).toBe('moving');
    l = advanceLesson(net, l, 1_000 + 30_000);
    expect(l.step).toBe('second');
    expect(names(l)).toEqual(['Setiawangsa']);
  });

  it('typing Setiawangsa finishes the lesson', () => {
    let l = advanceLesson(net, typeAll(startLesson(net, 1_000), 'Jelatek', 1_000), 31_000);
    l = typeAll(l, 'Setiawangsa', 31_000);
    expect(l.step).toBe('done');
  });

  it('stays quiet however long it runs: no passengers, Incidents or extra trains', () => {
    const l = advanceLesson(net, startLesson(net, 0), 120_000);
    expect(l.career.sim.trains).toHaveLength(1);
    expect(l.career.sim.incidents).toEqual([]);
    expect(Object.values(l.career.sim.platforms).every((p) => Object.keys(p.waiting).length === 0)).toBe(true);
    expect(l.step).toBe('first');
  });

  it('a wrong key stalls and Backspace undoes it, as in a Shift', () => {
    let l = typeAll(startLesson(net, 0), 'Jx', 0);
    expect(l.career.aim).toMatchObject({ typed: 'J', misses: 1 });
    l = lessonBackspace(net, l, 0);
    expect(l.career.aim).toMatchObject({ typed: 'J', misses: 0 });
    expect(lessonKey(net, l, 'e', 0).career.aim.typed).toBe('J'); // still stalled
  });

  it('frames Dato\' Keramat, Jelatek and Setiawangsa', () => {
    expect(lessonStations(net).map((id) => net.stations.get(id)!.name))
      .toEqual(["Dato' Keramat", 'Jelatek', 'Setiawangsa']);
  });
});
