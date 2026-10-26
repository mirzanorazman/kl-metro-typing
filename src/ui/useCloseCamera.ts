import { useCallback, useState } from 'react';
import { CLOSE_CAMERA_DEFAULTS, CLOSE_RANGES, type CloseCameraSettings } from './dispatchCamera';

/** Where the dev camera panel keeps its settings. Development only. */
export const DISPATCH_CAMERA_KEY = 'klmetro.dispatchCamera.v1';

const clamp = (value: unknown, [min, max]: readonly [number, number], fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

/** Missing, unreadable or malformed settings load as the defaults, field by field. */
function loadSettings(): CloseCameraSettings {
  try {
    const stored = localStorage.getItem(DISPATCH_CAMERA_KEY);
    if (stored === null) return CLOSE_CAMERA_DEFAULTS;
    const raw: unknown = JSON.parse(stored);
    if (typeof raw !== 'object' || raw === null) return CLOSE_CAMERA_DEFAULTS;
    const s = raw as Partial<Record<keyof CloseCameraSettings, unknown>>;
    const d = CLOSE_CAMERA_DEFAULTS;
    return {
      on: typeof s.on === 'boolean' ? s.on : d.on,
      early: clamp(s.early, CLOSE_RANGES.early, d.early),
      late: clamp(s.late, CLOSE_RANGES.late, d.late),
      holdMs: clamp(s.holdMs, CLOSE_RANGES.holdMs, d.holdMs),
    };
  } catch {
    return CLOSE_CAMERA_DEFAULTS;
  }
}

function saveSettings(settings: CloseCameraSettings): void {
  try {
    localStorage.setItem(DISPATCH_CAMERA_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable: the settings last until the page reloads.
  }
}

const noChange = () => {};

/**
 * The close camera's settings and a setter. Development only: in a production
 * build it is always the defaults (close camera off), and storage is never
 * touched.
 */
export function useCloseCamera(): [CloseCameraSettings, (next: CloseCameraSettings) => void] {
  const [settings, setSettings] = useState(() => (import.meta.env.DEV ? loadSettings() : CLOSE_CAMERA_DEFAULTS));
  const change = useCallback((next: CloseCameraSettings) => {
    setSettings(next);
    // Guarded here as well, so a production build drops the storage code.
    if (import.meta.env.DEV) saveSettings(next);
  }, []);
  return import.meta.env.DEV ? [settings, change] : [CLOSE_CAMERA_DEFAULTS, noChange];
}
