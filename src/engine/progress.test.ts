import { describe, it, expect, beforeEach } from 'vitest';
import { emptyProfile, loadProfile, saveProfile, recordStation, STORAGE_KEY } from './progress';

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
