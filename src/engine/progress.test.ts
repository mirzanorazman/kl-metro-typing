import { describe, it, expect, beforeEach } from 'vitest';
import {
  emptyProfile,
  loadProfile,
  saveProfile,
  recordStation,
  recordQuickBest,
  recordQuickBestOverall,
  saveSelectedLine,
  recordIntegrityFail,
  markRushTipSeen,
  resetRushTips,
  INTEGRITY_FAIL_LIMIT,
  STORAGE_KEY,
  type Profile,
} from './progress';

beforeEach(() => localStorage.clear());

describe('loadProfile', () => {
  it('returns an empty profile when nothing is stored', () => {
    expect(loadProfile().visited).toEqual([]);
  });

  it('round-trips a saved profile', () => {
    const p = { ...emptyProfile(), visited: ['imbi'] };
    saveProfile(p);
    expect(loadProfile().visited).toEqual(['imbi']);
  });

  it('recovers from a corrupt record instead of throwing', () => {
    localStorage.setItem(STORAGE_KEY, 'not json {{{');
    const p = loadProfile();
    expect(p.visited).toEqual([]);
    expect(p.recovered).toBe(true);
  });

  it('recovers from a record with an unknown schema version', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 999 }));
    expect(loadProfile().recovered).toBe(true);
  });
});

describe('recordStation', () => {
  it('adds a newly visited station', () => {
    expect(recordStation(emptyProfile(), 'imbi', 50).visited).toEqual(['imbi']);
  });

  it('does not duplicate a station already visited', () => {
    const once = recordStation(emptyProfile(), 'imbi', 50);
    expect(recordStation(once, 'imbi', 40).visited).toEqual(['imbi']);
  });

  it('keeps the best WPM for a station', () => {
    let p = recordStation(emptyProfile(), 'imbi', 50);
    p = recordStation(p, 'imbi', 70);
    p = recordStation(p, 'imbi', 60);
    expect(p.bestWpm['imbi']).toBe(70);
  });
});

describe('theme preference', () => {
  it('is absent on a fresh profile, meaning "follow the OS"', () => {
    expect(emptyProfile().theme).toBeUndefined();
  });

  it('survives a save and load round trip', () => {
    saveProfile({ ...emptyProfile(), theme: 'midnight' });
    expect(loadProfile().theme).toBe('midnight');
  });

  it('carries older saves forward without a theme rather than rejecting them', () => {
    // A record written before the field existed. It must migrate, not recover.
    const old = { ...emptyProfile() } as Record<string, unknown>;
    delete old.theme;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(old));

    const loaded = loadProfile();
    expect(loaded.recovered).toBeUndefined();
    expect(loaded.theme).toBeUndefined();
  });
});

describe('quick run profile fields', () => {
  it('loads old profiles without new fields without recovery', () => {
    const old = { ...emptyProfile() } as Record<string, unknown>;
    delete old.quickBest;
    delete old.lastSelectedLine;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(old));

    const loaded = loadProfile();
    expect(loaded.quickBest).toEqual({});
    expect(loaded.lastSelectedLine).toBeUndefined();
    expect(loaded.recovered).toBeUndefined();
  });

  it('loads old v1 profiles without an overall best and keeps legacy bests', () => {
    const old = { ...emptyProfile(), quickBest: { KJ: 42 } } as Record<string, unknown>;
    delete old.quickBestOverall;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(old));

    const loaded = loadProfile();
    expect(loaded.quickBestOverall).toBeUndefined();
    expect(loaded.quickBest).toEqual({ KJ: 42 });
    expect(loaded.recovered).toBeUndefined();
  });

  it('sanitizes the overall best independently and retains zero', () => {
    for (const malformed of [-1, Number.POSITIVE_INFINITY, Number.NaN, 'bad', null, {}]) {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...emptyProfile(), quickBest: { KJ: 42 }, quickBestOverall: malformed }),
      );
      const loaded = loadProfile();
      expect(loaded.quickBestOverall).toBeUndefined();
      expect(loaded.quickBest).toEqual({ KJ: 42 });
      expect(loaded.recovered).toBeUndefined();
    }

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...emptyProfile(), quickBest: { KJ: 42 }, quickBestOverall: 0 }),
    );
    expect(loadProfile().quickBestOverall).toBe(0);
  });

  it('round-trips the overall best without changing legacy quick bests', () => {
    saveProfile({ ...emptyProfile(), quickBest: { KJ: 42 }, quickBestOverall: 81 });
    const loaded = loadProfile();
    expect(loaded.quickBestOverall).toBe(81);
    expect(loaded.quickBest).toEqual({ KJ: 42 });
  });

  it('sanitizes malformed new fields while retaining old progress', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...emptyProfile(), visited: ['imbi'], quickBest: 'broken', lastSelectedLine: 'NOPE' }),
    );

    const loaded = loadProfile();
    expect(loaded.visited).toEqual(['imbi']);
    expect(loaded.quickBest).toEqual({});
    expect(loaded.lastSelectedLine).toBeUndefined();
    expect(loaded.recovered).toBeUndefined();
  });

  it('discards malformed quick scores while retaining valid known lines', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...emptyProfile(),
        quickBest: { KJ: 42, MR: 0, AG: -1, SP: Infinity, SA: 'bad', NOPE: 99 },
      }),
    );

    const loaded = loadProfile();
    expect(loaded.quickBest).toEqual({ KJ: 42, MR: 0 });
    expect(loaded.recovered).toBeUndefined();
  });

  it('round-trips valid quick fields', () => {
    saveProfile({ ...emptyProfile(), quickBest: { KJ: 60, MR: 75 }, lastSelectedLine: 'MR' });
    expect(loadProfile().quickBest).toEqual({ KJ: 60, MR: 75 });
    expect(loadProfile().lastSelectedLine).toBe('MR');
  });
});

describe('recordQuickBest', () => {
  it('replaces only with a higher finite non-negative score', () => {
    const original = { ...emptyProfile(), quickBest: { KJ: 60 } };
    const higher = recordQuickBest(original, 'KJ', 75);
    expect(higher.quickBest).toEqual({ KJ: 75 });
    expect(recordQuickBest(higher, 'KJ', 70)).toBe(higher);
    expect(recordQuickBest(higher, 'KJ', Number.NaN)).toBe(higher);
    expect(recordQuickBest(higher, 'KJ', -1)).toBe(higher);
  });

  it('keeps scores separate for KJ and MR', () => {
    const withKj = recordQuickBest(emptyProfile(), 'KJ', 80);
    const withMr = recordQuickBest(withKj, 'MR', 40);
    expect(withMr.quickBest).toEqual({ KJ: 80, MR: 40 });
  });
});

describe('recordQuickBestOverall', () => {
  it('replaces only with a higher finite non-negative score', () => {
    const original = { ...emptyProfile(), quickBest: { KJ: 60 } };
    const higher = recordQuickBestOverall(original, 75);
    expect(higher.quickBestOverall).toBe(75);
    expect(higher.quickBest).toBe(original.quickBest);
    expect(recordQuickBestOverall(higher, 75)).toBe(higher);
    expect(recordQuickBestOverall(higher, 70)).toBe(higher);
    expect(recordQuickBestOverall(higher, Number.NaN)).toBe(higher);
    expect(recordQuickBestOverall(higher, Number.POSITIVE_INFINITY)).toBe(higher);
    expect(recordQuickBestOverall(higher, -1)).toBe(higher);
  });

  it('treats a missing overall best as zero', () => {
    const original = emptyProfile();
    expect(recordQuickBestOverall(original, 0)).toBe(original);
    expect(recordQuickBestOverall(original, 1).quickBestOverall).toBe(1);
  });

  it('treats an invalid current overall best as zero and preserves legacy bests', () => {
    const original = { ...emptyProfile(), quickBest: { KJ: 60 }, quickBestOverall: -1 };
    const updated = recordQuickBestOverall(original, 1);
    expect(updated.quickBestOverall).toBe(1);
    expect(updated.quickBest).toBe(original.quickBest);
  });
});

describe('saveSelectedLine', () => {
  it('changes only the selected line', () => {
    const original = { ...emptyProfile(), visited: ['imbi'] };
    const selected = saveSelectedLine(original, 'MR');
    expect(selected.lastSelectedLine).toBe('MR');
    expect(selected.visited).toEqual(['imbi']);
    expect(selected.quickBest).toEqual({});
  });
});

describe('recordIntegrityFail', () => {
  it('records a failure newest first', () => {
    let profile = emptyProfile();
    profile = recordIntegrityFail(profile, { t: 1, mode: 'line', reason: 'batched-input' });
    profile = recordIntegrityFail(profile, { t: 2, mode: 'quick', reason: 'untrusted-input' });
    expect(profile.integrityFails).toEqual([
      { t: 2, mode: 'quick', reason: 'untrusted-input' },
      { t: 1, mode: 'line', reason: 'batched-input' },
    ]);
  });

  it('keeps only the most recent failures', () => {
    let profile = emptyProfile();
    for (let i = 0; i < INTEGRITY_FAIL_LIMIT + 5; i++) {
      profile = recordIntegrityFail(profile, { t: i, mode: 'line', reason: 'impossible-speed' });
    }
    expect(profile.integrityFails).toHaveLength(INTEGRITY_FAIL_LIMIT);
    expect(profile.integrityFails![0]!.t).toBe(INTEGRITY_FAIL_LIMIT + 4);
  });

  it('does not mutate the profile it is given', () => {
    const profile = emptyProfile();
    recordIntegrityFail(profile, { t: 1, mode: 'line', reason: 'malformed-log' });
    expect(profile.integrityFails).toBeUndefined();
  });

  it('survives a save and load round trip', () => {
    const profile = recordIntegrityFail(emptyProfile(), {
      t: 7, mode: 'quick', reason: 'inhuman-consistency',
    });
    saveProfile(profile);
    expect(loadProfile().integrityFails).toEqual([
      { t: 7, mode: 'quick', reason: 'inhuman-consistency' },
    ]);
  });

  it('loads a profile saved before the field existed', () => {
    const old = { ...emptyProfile() };
    delete (old as Partial<Profile>).integrityFails;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(old));
    const loaded = loadProfile();
    expect(loaded.recovered).toBeUndefined();
    expect(loaded.integrityFails).toBeUndefined();
  });
});

describe('Rush Hour tips seen', () => {
  it('records each tip once and resets to none', () => {
    let p = markRushTipSeen(emptyProfile(), 'junction');
    p = markRushTipSeen(p, 'junction');
    expect(p.rushTipsSeen).toEqual(['junction']);
    expect(resetRushTips(p).rushTipsSeen).toEqual([]);
  });

  it('survives a save, and older saves load without it', () => {
    saveProfile(markRushTipSeen(emptyProfile(), 'start'));
    expect(loadProfile().rushTipsSeen).toEqual(['start']);
    saveProfile(emptyProfile());
    expect(loadProfile().rushTipsSeen).toBeUndefined();
  });

  it('drops junk from a stored list', () => {
    saveProfile({ ...emptyProfile(), rushTipsSeen: ['walk', 7 as unknown as string] });
    expect(loadProfile().rushTipsSeen).toEqual(['walk']);
  });
});
