import type { Metrics } from '../engine/metrics';

export interface HUDProps {
  metrics: Metrics;
  stationsThisRun: number;
  lineName: string | null;
  toward: string | null;
}

export function HUD({ metrics, stationsThisRun, lineName, toward }: HUDProps) {
  return (
    <div className="hud">
      <span className="hud-line">{lineName ?? 'Choose a direction'}</span>
      {toward && <span className="hud-toward">toward {toward}</span>}
      <span>WPM {Math.round(metrics.wpm)}</span>
      <span>ACC {Math.round(metrics.accuracy * 100)}%</span>
      <span>Stations {stationsThisRun}</span>
    </div>
  );
}
