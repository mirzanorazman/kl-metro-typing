import type { LineCode } from '../data/types';

export const STORAGE_KEY = 'myrapid.v1';
const SCHEMA_VERSION = 1;

export interface AdventurePosition {
  at: string;
  arrivedFrom: string | null;
  line: LineCode | null;
}

export interface Profile {
  version: number;
  visited: string[];
  bestWpm: Record<string, number>;
  adventure: AdventurePosition | null;
  /** Rush Hour high scores, keyed by sorted line-set. Written by Plan 2. */
  rushHigh: Record<string, number>;
  /** Sound preference. Additive, so older saves migrate to unmuted. */
  muted: boolean;
  wpmHistory: { t: number; wpm: number }[];
  /** True when this profile replaced an unreadable saved record. */
  recovered?: boolean;
}

export function emptyProfile(): Profile {
  return {
    version: SCHEMA_VERSION,
    visited: [],
    bestWpm: {},
    adventure: null,
    rushHigh: {},
    muted: false,
    wpmHistory: [],
  };
}

/**
 * Future schema versions migrate here. An unknown version is treated as
 * unreadable rather than guessed at.
 */
function migrate(raw: unknown): Profile | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const rec = raw as Partial<Profile>;
  if (rec.version !== SCHEMA_VERSION) return null;
  return { ...emptyProfile(), ...rec, version: SCHEMA_VERSION };
}

export function loadProfile(): Profile {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    return { ...emptyProfile(), recovered: true };
  }
  if (stored === null) return emptyProfile();

  try {
    const migrated = migrate(JSON.parse(stored));
    if (migrated) return migrated;
  } catch {
    // falls through to recovery
  }
  return { ...emptyProfile(), recovered: true };
}

export function saveProfile(profile: Profile): void {
  const clean: Profile = { ...profile };
  delete clean.recovered;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // Storage unavailable or full. The run continues; progress is simply not kept.
  }
}

export function recordStation(profile: Profile, id: string, wpm: number): Profile {
  const visited = profile.visited.includes(id) ? profile.visited : [...profile.visited, id];
  const best = profile.bestWpm[id] ?? 0;
  return {
    ...profile,
    visited,
    bestWpm: { ...profile.bestWpm, [id]: Math.max(best, wpm) },
  };
}

export function recordRun(profile: Profile, at: number, wpm: number): Profile {
  return { ...profile, wpmHistory: [...profile.wpmHistory, { t: at, wpm }] };
}

export function saveAdventurePosition(
  profile: Profile,
  position: AdventurePosition | null,
): Profile {
  return { ...profile, adventure: position };
}
