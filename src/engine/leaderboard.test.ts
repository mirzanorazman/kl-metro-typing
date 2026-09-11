import { describe, it, expect } from 'vitest';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from './network';
import {
  LEADERBOARD_LIMIT,
  cutoffValue,
  compareEntries,
  lineCharCount,
  longestLineCharCount,
  makeEntry,
  rankOf,
  rankedInsert,
  weightForLine,
  wouldQualify,
  type LeaderboardEntry,
} from './leaderboard';

const net = buildNetwork(loadNetworkData());

function entry(overrides: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
  return {
    id: 'e1',
    name: 'Ali',
    lineCode: 'MR',
    wpm: 60,
    accuracy: 1,
    score: 60,
    weightedScore: 60,
    playedAt: 0,
    ...overrides,
  };
}

describe('LEADERBOARD_LIMIT', () => {
  it('is 20', () => {
    expect(LEADERBOARD_LIMIT).toBe(20);
  });
});

describe('lineCharCount', () => {
  it('sums station name lengths along the fixed route', () => {
    // KL Sentral, Tun Sambanthan, Maharajalela, Hang Tuah, Imbi, Bukit Bintang,
    // Raja Chulan, Bukit Nanas, Medan Tuanku, Chow Kit, Titiwangsa
    expect(lineCharCount(net, 'MR')).toBe(114);
  });
});

describe('longestLineCharCount', () => {
  it('finds the longest line by character count', () => {
    expect(longestLineCharCount(net)).toBe(469); // Putrajaya Line
  });
});

describe('weightForLine', () => {
  it('gives the longest line a weight of 1', () => {
    expect(weightForLine(net, 'PY')).toBeCloseTo(1);
  });

  it('gives a shorter line a proportionally smaller weight', () => {
    expect(weightForLine(net, 'MR')).toBeCloseTo(114 / 469);
  });
});

describe('makeEntry', () => {
  it('computes weightedScore from score and weight', () => {
    const e = makeEntry({
      id: 'e1',
      name: 'Ali',
      lineCode: 'MR',
      metrics: { wpm: 60, accuracy: 1, score: 60 },
      weight: 0.5,
      playedAt: 10,
    });
    expect(e.weightedScore).toBe(30);
    expect(e.name).toBe('Ali');
    expect(e.playedAt).toBe(10);
  });
});

describe('compareEntries', () => {
  it('orders by key, descending', () => {
    const a = entry({ id: 'a', score: 80 });
    const b = entry({ id: 'b', score: 90 });
    expect(compareEntries(a, b, 'score')).toBeGreaterThan(0);
  });

  it('breaks ties by earlier playedAt', () => {
    const earlier = entry({ id: 'a', score: 80, playedAt: 1 });
    const later = entry({ id: 'b', score: 80, playedAt: 2 });
    expect(compareEntries(earlier, later, 'score')).toBeLessThan(0);
  });
});

describe('rankedInsert', () => {
  it('inserts in sorted order', () => {
    const entries = [entry({ id: 'a', score: 90 }), entry({ id: 'c', score: 70 })];
    const next = rankedInsert(entries, entry({ id: 'b', score: 80 }), 'score');
    expect(next.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('trims to the limit', () => {
    const entries = Array.from({ length: 20 }, (_, i) => entry({ id: `e${i}`, score: 100 - i }));
    const next = rankedInsert(entries, entry({ id: 'new', score: 50 }), 'score', 20);
    expect(next).toHaveLength(20);
    expect(next.find((e) => e.id === 'new')).toBeUndefined();
  });

  it('does not mutate the input array', () => {
    const entries = [entry({ id: 'a', score: 90 })];
    rankedInsert(entries, entry({ id: 'b', score: 80 }), 'score');
    expect(entries).toHaveLength(1);
  });
});

describe('cutoffValue', () => {
  it('is null when the board has not reached the limit', () => {
    const entries = [entry({ id: 'a', score: 90 })];
    expect(cutoffValue(entries, 'score', 20)).toBeNull();
  });

  it('is the lowest score on a full board', () => {
    const entries = Array.from({ length: 3 }, (_, i) => entry({ id: `e${i}`, score: 90 - i * 10 }));
    expect(cutoffValue(entries, 'score', 3)).toBe(70);
  });
});

describe('wouldQualify', () => {
  it('always qualifies while the board has room', () => {
    expect(wouldQualify([], 1, 'score', 20)).toBe(true);
  });

  it('qualifies only by beating the cutoff on a full board', () => {
    const entries = Array.from({ length: 3 }, (_, i) => entry({ id: `e${i}`, score: 90 - i * 10 }));
    expect(wouldQualify(entries, 71, 'score', 3)).toBe(true);
    expect(wouldQualify(entries, 70, 'score', 3)).toBe(false);
  });
});

describe('rankOf', () => {
  it('is 1-indexed', () => {
    const entries = [entry({ id: 'a' }), entry({ id: 'b' })];
    expect(rankOf(entries, 'a')).toBe(1);
    expect(rankOf(entries, 'b')).toBe(2);
  });

  it('is null when the id is not present', () => {
    expect(rankOf([entry({ id: 'a' })], 'z')).toBeNull();
  });
});

describe('makeEntry verification', () => {
  const metrics = { wpm: 60, accuracy: 0.95, score: 54.15 };

  it('marks a verified entry', () => {
    const entry = makeEntry({
      id: 'a', name: 'Mirza', lineCode: 'MR', metrics, weight: 1, playedAt: 0, verified: true,
    });
    expect(entry.verified).toBe(true);
  });

  it('leaves an unverified entry unmarked rather than marking it false', () => {
    const entry = makeEntry({
      id: 'a', name: 'Mirza', lineCode: 'MR', metrics, weight: 1, playedAt: 0,
    });
    expect(entry.verified).toBeUndefined();
    expect('verified' in entry).toBe(false);
  });
});
