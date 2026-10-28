import { useCallback, useState } from 'react';
import {
  type AmberRule,
  CROWDING_DELAY_RANGE,
  CROWDING_HINT_DEFAULTS,
  CROWDING_HINT_OFF,
  type CrowdingHintMode,
  type CrowdingHintSettings,
} from '../render/crowdingHint';

/** Where the dev panel keeps the crowding hint's settings. Development only. */
export const DISPATCH_CROWDING_KEY = 'klmetro.dispatchCrowding.v1';

const MODES: readonly CrowdingHintMode[] = ['off', 'a', 'b'];
const AMBER_RULES: readonly AmberRule[] = ['blocks', 'time'];

const clamp = (value: unknown, [min, max]: readonly [number, number], fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

/** Missing, unreadable or malformed settings load as the defaults, field by field. */
function loadSettings(): CrowdingHintSettings {
  const d = CROWDING_HINT_DEFAULTS;
  try {
    const stored = localStorage.getItem(DISPATCH_CROWDING_KEY);
    if (stored === null) return d;
    const raw: unknown = JSON.parse(stored);
    if (typeof raw !== 'object' || raw === null) return d;
    const s = raw as Partial<Record<keyof CrowdingHintSettings, unknown>>;
    return {
      mode: MODES.find((mode) => mode === s.mode) ?? d.mode,
      delayMs: clamp(s.delayMs, CROWDING_DELAY_RANGE, d.delayMs),
      declutter: typeof s.declutter === 'boolean' ? s.declutter : d.declutter,
      amber: AMBER_RULES.find((rule) => rule === s.amber) ?? d.amber,
    };
  } catch {
    return d;
  }
}

function saveSettings(settings: CrowdingHintSettings): void {
  try {
    localStorage.setItem(DISPATCH_CROWDING_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable: the settings last until the page reloads.
  }
}

const noChange = () => {};

/**
 * The crowding hint's settings and a setter. The panel and its storage are
 * development only: a production build always has the hint off and never
 * touches storage.
 */
export function useCrowdingHint(): [CrowdingHintSettings, (next: CrowdingHintSettings) => void] {
  const [settings, setSettings] = useState(() => (import.meta.env.DEV ? loadSettings() : CROWDING_HINT_OFF));
  const change = useCallback((next: CrowdingHintSettings) => {
    setSettings(next);
    // Guarded here as well, so a production build drops the storage code.
    if (import.meta.env.DEV) saveSettings(next);
  }, []);
  return import.meta.env.DEV ? [settings, change] : [CROWDING_HINT_OFF, noChange];
}
