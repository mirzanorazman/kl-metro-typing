import { useCallback } from 'react';
import type { LineCode } from '../data/types';
import type { NetworkIndex } from '../engine/network';
import type { Metrics } from '../engine/metrics';
import { rushDayPhase, type RushState } from '../engine/rushHour';
import { LineBadge } from './LineBadge';
import { useKeyboard } from './useKeyboard';

export interface RushSummaryProps {
  net: NetworkIndex;
  run: RushState;
  metrics: Metrics;
  /** Best for this Line set after this Run was judged; null while judging. */
  best: number | null;
  newBest: boolean;
  onAgain: () => void;
  onBack: () => void;
}

export function RushSummary({ net, run, metrics, best, newBest, onAgain, onBack }: RushSummaryProps) {
  const phase = rushDayPhase(run.gameMs);
  const overflowed = run.overflowedAt ? net.stations.get(run.overflowedAt)?.name : null;

  const onKey = useCallback(
    (key: string) => {
      if (key === 'Enter') onAgain();
      if (key === 'Escape') onBack();
    },
    [onAgain, onBack],
  );
  useKeyboard(onKey);

  return (
    <div className="summary rush-summary" role="region" aria-label="Rush Hour summary">
      <h1>{run.endReason === 'overflow' ? 'Overcrowded' : 'Run ended'}</h1>
      <p className="rush-summary-lines">
        {run.lineSet.map((code: LineCode) => (
          <LineBadge key={code} code={code} colour={net.lines.get(code)!.colour} />
        ))}
      </p>
      {overflowed && <p>{overflowed} overflowed.</p>}
      {run.endReason === 'abandoned' && <p>Ended early — only a Run that ends in an Overflow can set a best.</p>}
      <dl className="rush-summary-stats">
        <dt>Delivered</dt>
        <dd>{run.delivered}</dd>
        <dt>Reached</dt>
        <dd>Day {phase.day} · {phase.name}</dd>
        <dt>WPM</dt>
        <dd>{Math.round(metrics.wpm)}</dd>
        <dt>Accuracy</dt>
        <dd>{Math.round(metrics.accuracy * 100)}%</dd>
        <dt>Best</dt>
        <dd>{best === null ? '—' : best}{newBest && <strong className="rush-new-best"> New best</strong>}</dd>
      </dl>
      <div className="summary-actions">
        <button type="button" onClick={onAgain}>
          <kbd>Enter</kbd> Play again
        </button>
        <button type="button" onClick={onBack}>
          <kbd>Esc</kbd> Back to map
        </button>
      </div>
    </div>
  );
}
