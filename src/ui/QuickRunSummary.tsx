import type { Metrics } from '../engine/metrics';
import { QUICK_RUN_MS } from '../engine/quickRun';
import './mobile.css';

export interface QuickRunSummaryProps {
  lineName: string;
  status: 'completed' | 'interrupted';
  stations: number;
  metrics: Metrics;
  personalBest: number | null;
  newBest: boolean;
  onAgain: () => void;
  onBack: () => void;
}

export function QuickRunSummary({
  lineName,
  status,
  stations,
  metrics,
  personalBest,
  newBest,
  onAgain,
  onBack,
}: QuickRunSummaryProps) {
  const resultStatus = status === 'interrupted'
    ? 'This result was not saved as a personal best.'
    : newBest
      ? 'New personal best'
      : personalBest === null
        ? null
        : `Personal best: ${Math.round(personalBest)}`;

  return (
    <section className="quick-summary">
      <h2>{status === 'completed' ? 'Quick Run complete' : 'Run interrupted'}</h2>
      <p>{`${lineName} · ${QUICK_RUN_MS / 1000} seconds`}</p>

      <dl>
        <dt>Stations completed</dt>
        <dd>{Math.round(stations)}</dd>
        <dt>WPM</dt>
        <dd>{Math.round(metrics.wpm)}</dd>
        <dt>Accuracy</dt>
        <dd>{(metrics.accuracy * 100).toFixed(1)}%</dd>
        <dt>Score</dt>
        <dd>{Math.round(metrics.score)}</dd>
      </dl>

      {resultStatus && <p role="status">{resultStatus}</p>}

      <div className="quick-summary-actions">
        <button type="button" onClick={onAgain}>Run again</button>
        <button type="button" onClick={onBack}>Back to Transit</button>
      </div>
    </section>
  );
}
