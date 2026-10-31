import type { Metrics } from '../engine/metrics';
import type { LineCode } from '../data/types';
import type { EarnedTier } from '../engine/achievementState';
import type { NetworkIndex } from '../engine/network';
import { QUICK_RUN_MS } from '../engine/quickRun';
import type { ShareCard } from '../share/shareCard';
import { PhoneLandscapeBlock } from './PhoneLandscapeBlock';
import { SummaryShare } from './SummaryShare';
import { NewAchievements } from './NewAchievements';
import './mobile.css';

export interface QuickRunSummaryProps {
  net: NetworkIndex;
  lines: readonly LineCode[];
  status: 'completed' | 'interrupted';
  stations: number;
  metrics: Metrics;
  personalBest: number | null;
  newBest: boolean;
  /** What the Run earned; an interrupted Run earns nothing. */
  achievements?: readonly EarnedTier[];
  /** How many more are waiting to be announced, shown as "+n more". */
  moreAchievements?: number;
  /** The card to share; null for an interrupted Run, which has nothing to show. */
  share?: ShareCard | null;
  onAgain: () => void;
  onBack: () => void;
  /** Opens the achievements screen from "+n more". */
  onOpenAchievements?: () => void;
  phoneLandscape?: boolean;
}

export function QuickRunSummary({
  net,
  lines,
  status,
  stations,
  metrics,
  personalBest,
  newBest,
  achievements = [],
  moreAchievements = 0,
  share = null,
  onAgain,
  onBack,
  onOpenAchievements,
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
      <SummaryShare net={net} card={share} items={achievements} showImage fallback={stats} />

      <NewAchievements net={net} items={achievements} more={moreAchievements} onMore={onOpenAchievements} />

      <div className="quick-summary-actions">
        <button type="button" disabled={phoneLandscape} onClick={onAgain}>Run again</button>
        <button type="button" onClick={onBack}>Back to Transit</button>
      </div>
    </section>
  );
}
