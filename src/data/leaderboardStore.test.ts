import { describe, it, expect, beforeEach } from 'vitest';
import { loadNetworkData } from './load';
import { buildNetwork } from '../engine/network';
import type { Metrics } from '../engine/metrics';
import {
  LEADERBOARD_STORAGE_KEY,
  emptyStore,
  evaluateRun,
  knownNames,
  loadStore,
  saveStore,
  submitEntry,
} from './leaderboardStore';

const net = buildNetwork(loadNetworkData());
const metrics = (score: number): Metrics => ({ wpm: score, accuracy: 1, score });

beforeEach(() => localStorage.clear());

describe('emptyStore', () => {
  it('has an empty overall board and an empty board for every line', () => {
    const store = emptyStore();
    expect(store.overall).toEqual([]);
    expect(store.perLine.MR).toEqual([]);
    expect(store.perLine.PY).toEqual([]);
  });
});

describe('loadStore / saveStore', () => {
  it('round-trips through localStorage', () => {
    const { store } = submitEntry(net, emptyStore(), {
      name: 'Ali', lineCode: 'MR', metrics: metrics(60), playedAt: 1,
    });
    saveStore(store);
    expect(loadStore().perLine.MR).toHaveLength(1);
  });

  it('returns an empty store when nothing is saved', () => {
    expect(loadStore()).toEqual(emptyStore());
  });

  it('recovers from unreadable data', () => {
    localStorage.setItem(LEADERBOARD_STORAGE_KEY, 'not json {{{');
    expect(loadStore()).toEqual(emptyStore());
  });
});

describe('evaluateRun', () => {
  it('qualifies for both boards while they have room', () => {
    const q = evaluateRun(net, emptyStore(), 'MR', metrics(60));
    expect(q.overallQualifies).toBe(true);
    expect(q.lineQualifies).toBe(true);
    expect(q.overallCutoff).toBeNull();
    expect(q.lineCutoff).toBeNull();
  });

  it('weights the score by the line length', () => {
    const q = evaluateRun(net, emptyStore(), 'MR', metrics(60));
    expect(q.weightedScore).toBeCloseTo(60 * (114 / 469));
  });

  it('stops qualifying once a board is full of higher scores', () => {
    let store = emptyStore();
    for (let i = 0; i < 20; i++) {
      store = submitEntry(net, store, {
        name: `p${i}`, lineCode: 'MR', metrics: metrics(100), playedAt: i,
      }).store;
    }
    const q = evaluateRun(net, store, 'MR', metrics(10));
    expect(q.lineQualifies).toBe(false);
    expect(q.lineCutoff).toBe(100);
  });
});

describe('submitEntry', () => {
  it('adds the entry to both boards and reports each rank', () => {
    const result = submitEntry(net, emptyStore(), {
      name: 'Ali', lineCode: 'MR', metrics: metrics(60), playedAt: 1,
    });
    expect(result.overallRank).toBe(1);
    expect(result.lineRank).toBe(1);
    expect(result.store.perLine.MR[0]?.name).toBe('Ali');
    expect(result.store.overall[0]?.name).toBe('Ali');
  });

  it('only adds to a board it qualifies for', () => {
    let store = emptyStore();
    for (let i = 0; i < 20; i++) {
      store = submitEntry(net, store, {
        name: `p${i}`, lineCode: 'MR', metrics: metrics(100), playedAt: i,
      }).store;
    }
    const result = submitEntry(net, store, {
      name: 'Late', lineCode: 'MR', metrics: metrics(10), playedAt: 100,
    });
    expect(result.lineRank).toBeNull();
    expect(result.store.perLine.MR.find((e) => e.name === 'Late')).toBeUndefined();
  });

  it('persists to localStorage', () => {
    submitEntry(net, emptyStore(), { name: 'Ali', lineCode: 'MR', metrics: metrics(60), playedAt: 1 });
    expect(loadStore().perLine.MR).toHaveLength(1);
  });

  it('trims whitespace from the name', () => {
    const result = submitEntry(net, emptyStore(), {
      name: '  Ali  ', lineCode: 'MR', metrics: metrics(60), playedAt: 1,
    });
    expect(result.store.overall[0]?.name).toBe('Ali');
  });
});

describe('knownNames', () => {
  it('collects unique names from every board, alphabetically', () => {
    let store = emptyStore();
    store = submitEntry(net, store, { name: 'Ali', lineCode: 'MR', metrics: metrics(60), playedAt: 1 }).store;
    store = submitEntry(net, store, { name: 'Ali', lineCode: 'PY', metrics: metrics(50), playedAt: 2 }).store;
    store = submitEntry(net, store, { name: 'Bee', lineCode: 'AG', metrics: metrics(40), playedAt: 3 }).store;
    expect(knownNames(store)).toEqual(['Ali', 'Bee']);
  });
});
