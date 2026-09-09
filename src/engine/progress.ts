import { LINE_CODES, type LineCode } from '../data/types';

export const STORAGE_KEY = 'klmetro.v1';
const SCHEMA_VERSION = 1;

export interface AdventurePosition {
  at: string;
  arrivedFrom: string | null;
  line: LineCode | null;
}

/** Which atmosphere the app renders in. */
export type Theme = 'paper' | 'midnight';

export interface Profile {
  version: number;
  visited: string[];
  bestWpm: Record<string, number>;
  adventure: AdventurePosition | null;
  /** Rush Hour high scores, keyed by sorted line-set. Written by Plan 2. */
  rushHigh: Record<string, number>;
  /** Sound preference. Additive, so older saves migrate to unmuted. */
  muted: boolean;
  /** Quick Run high scores, keyed by line code. */
  quickBest: Partial<Record<LineCode, number>>;
  /** Last line selected for Quick Run. */
  lastSelectedLine?: LineCode;
  /**
   * Display preference. Absent means the player has never chosen, and the app
   * follows the OS. Optional and additive, so `migrate`'s spread carries older
   * saves forward untouched — the same way `muted` was added.
   */
  theme?: Theme;
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
    quickBest: {},
    wpmHistory: [],
  };
}

function isLineCode(value: unknown): value is LineCode {
  return typeof value === 'string' && LINE_CODES.includes(value as LineCode);
}

function cleanQuickBest(value: unknown): Partial<Record<LineCode, number>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};

  const clean: Partial<Record<LineCode, number>> = {};
  for (const [line, score] of Object.entries(value)) {
    if (isLineCode(line) && typeof score === 'number' && Number.isFinite(score) && score >= 0) {
      clean[line] = score;
    }
  }
  return clean;
}

/**
 * Future schema versions migrate here. An unknown version is treated as
 * unreadable rather than guessed at.
 */
function migrate(raw: unknown): Profile | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const rec = raw as Partial<Profile>;
  if (rec.version !== SCHEMA_VERSION) return null;
  return {
    ...emptyProfile(),
    ...rec,
    version: SCHEMA_VERSION,
    quickBest: cleanQuickBest(rec.quickBest),
    lastSelectedLine: isLineCode(rec.lastSelectedLine) ? rec.lastSelectedLine : undefined,
  };
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

export function recordQuickBest(profile: Profile, line: LineCode, score: number): Profile {
  const current = profile.quickBest[line];
  const best = typeof current === 'number' && Number.isFinite(current) && current >= 0 ? current : 0;
  if (!Number.isFinite(score) || score < 0 || score <= best) return profile;
  return { ...profile, quickBest: { ...profile.quickBest, [line]: score } };
}

export function saveSelectedLine(profile: Profile, line: LineCode): Profile {
  return { ...profile, lastSelectedLine: line };
}

export function saveAdventurePosition(
  profile: Profile,
  position: AdventurePosition | null,
): Profile {
  return { ...profile, adventure: position };
}
