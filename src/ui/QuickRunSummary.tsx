import type { Metrics } from '../engine/metrics';
import type { LineCode } from '../data/types';
import { QUICK_RUN_MS } from '../engine/quickRun';
import type { ShareCard } from '../share/shareCard';
import { PhoneLandscapeBlock } from './PhoneLandscapeBlock';
import { ShareButton } from './ShareButton';
import './mobile.css';

export interface QuickRunSummaryProps {
  lines: readonly LineCode[];
  status: 'completed' | 'interrupted';
  stations: number;
  metrics: Metrics;
  personalBest: number | null;
  newBest: boolean;
  /** The card to share; null for an interrupted Run, which has nothing to show. */
  share?: ShareCard | null;
  onAgain: () => void;
  onBack: () => void;
  phoneLandscape?: boolean;
}

export function QuickRunSummary({
  lines,
  status,
  stations,
  metrics,
  personalBest,
  newBest,
  share = null,
  onAgain,
  onBack,
  phoneLandscape = false,
}: QuickRunSummaryProps) {
  const resultStatus = status === 'interrupted'
    ? 'This result was not saved as a personal best.'
    : newBest
      ? 'New personal best'
      : personalBest === null
        ? null
        : `Personal best: ${Math.round(personalBest)}`;

  const stats = (
    <dl>
      <dt>Stations completed</dt>
      <dd>{Math.round(stations)}</dd>
      <dt>WPM</dt>
      <dd>{Math.round(metrics.wpm)}</dd>
      <dt>Accuracy</dt>
      <dd>{(metrics.accuracy * 100).toFixed(1)}%</dd>
      <dt>Score</dt>
      <dd>{Math.round(metrics.score)}</dd>
      <dt>Lines used</dt>
      <dd className="quick-summary-lines">{lines.join(' → ')}</dd>
    </dl>
  );

  return (
    <section className="quick-summary">
      <h2>{status === 'completed' ? 'Quick Run complete' : 'Run interrupted'}</h2>
      <p>{`${QUICK_RUN_MS / 1000} seconds`}</p>

      {!share && stats}

      {resultStatus && <p role="status">{resultStatus}</p>}
      {phoneLandscape && <PhoneLandscapeBlock />}
      {/* A completed Run's card already carries the stats, so it replaces them. */}
      {share && <ShareButton card={share} showImage fallback={stats} />}

      <div className="quick-summary-actions">
        <button type="button" disabled={phoneLandscape} onClick={onAgain}>Run again</button>
        <button type="button" onClick={onBack}>Back to Transit</button>
      </div>
    </section>
  );
}
