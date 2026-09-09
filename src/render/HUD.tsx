import { useEffect, useRef, useState } from 'react';
import type { Metrics } from '../engine/metrics';
import { easeInOut } from '../geo/layout';
import { Speedometer } from './Speedometer';
import { prefersReducedMotion } from './useLayoutMode';

const ROLL_MS = 260;

/**
 * Eases a displayed number toward its target instead of snapping.
 *
 * WPM jitters constantly while typing, and integers popping between values
 * reads as noise. Rolling it makes the panel feel alive and, more usefully,
 * makes the direction of travel legible at a glance.
 */
function useRolling(value: number): number {
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    shownRef.current = shown;
  }, [shown]);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(value);
      return;
    }
    // Roll from wherever the display currently is, so an interrupted roll
    // continues smoothly rather than snapping back to its old origin.
    const from = shownRef.current;
    const started = performance.now();

    const step = (now: number) => {
      const t = Math.min(1, (now - started) / ROLL_MS);
      setShown(from + (value - from) * easeInOut(t));
      if (t < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);

    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [value]);

  return shown;
}

export interface HUDProps {
  metrics: Metrics;
  stationsThisRun: number;
  lineName: string | null;
  toward: string | null;
}

export function HUD({ metrics, stationsThisRun, lineName, toward }: HUDProps) {
  const wpm = useRolling(metrics.wpm);
  const accuracy = useRolling(metrics.accuracy * 100);
  const stations = useRolling(stationsThisRun);

  return (
    <div className="hud">
      <div className="hud-context">
        <span className="hud-line">{lineName ?? 'Choose a direction'}</span>
        {toward && <span className="hud-toward">toward {toward}</span>}
      </div>

      {/* The three figures read as one instrument panel: a caption in the
          line's colour over a figure large enough to take in mid-keystroke,
          with the unit small beside it so the number keeps the weight. */}
      <div className="hud-stats">
        <Speedometer wpm={wpm} />
        <div className="hud-cell">
          <span className="hud-label">accuracy</span>
          <span className="hud-figure">
            {Math.round(accuracy)}
            <small>%</small>
          </span>
        </div>
        <div className="hud-cell">
          <span className="hud-label">visited</span>
          <span className="hud-figure">
            {Math.round(stations)}
            <small>stations</small>
          </span>
        </div>
      </div>
    </div>
  );
}
