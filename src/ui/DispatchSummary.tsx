import { useRef, useState } from 'react';
import {
  dispatchQualifies,
  loadDispatchBoard,
  submitDispatchEntry,
  type DispatchBoard,
} from '../data/dispatchBoardStore';
import { careerScore, careerTotals, type CareerState } from '../engine/dispatch';
import type { DispatchJudgement } from '../engine/dispatchJudge';
import { servedLines, servedStations } from '../engine/dispatchNetwork';
import type { Metrics } from '../engine/metrics';
import type { NetworkIndex } from '../engine/network';
import { closureText, failureText } from './dispatchTips';
import { careerCard } from '../share/shareCard';
import { LineBadge } from './LineBadge';
import { ShareButton } from './ShareButton';

export interface DispatchSummaryProps {
  net: NetworkIndex;
  career: CareerState;
  metrics: Metrics;
  /** The Career's judgement; null while judging (shown as checking), and always for one abandoned mid-Shift. */
  judgement: DispatchJudgement | null;
  onAgain: () => void;
  onBack: () => void;
}

const DISPATCH_CREDIT = 'Ridership estimates informed by data.gov.my (CC BY 4.0)';

/**
 * A verified Career that would place gets a name form; submitting saves it
 * with its replayed score and shows the board with its rank.
 */
function BoardEntry({ metrics, judgement, onSaved }: {
  metrics: Metrics;
  judgement: DispatchJudgement;
  /** Told the rank once a name is saved, for the share card. */
  onSaved: (rank: number | null) => void;
}) {
  const [board, setBoard] = useState<DispatchBoard>(() => loadDispatchBoard());
  const [name, setName] = useState('');
  const [saved, setSaved] = useState<{ id: string | null; rank: number | null } | null>(null);
  // A ref, not state: a second submit before the re-render must see it.
  const submitted = useRef(false);

  if (saved) {
    return (
      <div className="leaderboard-panel dispatch-board">
        <p role="status">
          {saved.rank === null ? 'Saved, but it fell off the board.' : `#${saved.rank} on the Dispatcher board`}
        </p>
        <table>
          <thead>
            <tr><th>#</th><th>Name</th><th>Score</th><th>Shifts</th></tr>
          </thead>
          <tbody>
            {board.entries.map((entry, i) => (
              <tr key={entry.id} data-current={entry.id === saved.id ? 'true' : undefined}>
                <td>{i + 1}</td>
                <td>{entry.name}{entry.id === saved.id && <strong> (you)</strong>}</td>
                <td>{Math.round(entry.score)}</td>
                <td>{entry.shifts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (!dispatchQualifies(board, judgement.score)) {
    return <p className="leaderboard-panel">Didn't make the leaderboard this time.</p>;
  }

  return (
    <form
      className="leaderboard-panel"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed || submitted.current) return;
        submitted.current = true;
        const result = submitDispatchEntry(board, {
          name: trimmed,
          score: judgement.score,
          delivered: judgement.delivered,
          shifts: judgement.cleared,
          metrics,
          playedAt: Date.now(),
          verified: true,
        });
        const id = result.rank === null ? null : result.board.entries[result.rank - 1]!.id;
        setBoard(result.board);
        setSaved({ id, rank: result.rank });
        onSaved(result.rank);
      }}
    >
      <p>You made the leaderboard! Enter a name:</p>
      <input
        value={name}
        maxLength={24}
        required
        onChange={(e) => setName(e.target.value)}
        aria-label="Your name"
      />
      <button type="submit">Save score</button>
    </form>
  );
}

export function DispatchSummary({ net, career, metrics, judgement, onAgain, onBack }: DispatchSummaryProps) {
  const totals = careerTotals(career);
  const stations = servedStations(net, career.served).length;
  const lines = servedLines(career.served);
  const abandoned = career.endReason === 'abandoned';
  const [rank, setRank] = useState<number | null>(null);

  return (
    <div className="summary dispatch-summary" role="region" aria-label="Career summary">
      <h1>{abandoned ? 'Career ended' : career.endReason === 'retired' ? 'Career retired' : 'Shift failed'}</h1>
      {career.failure && <p className="dispatch-failure">{failureText(net, career.failure)}</p>}
      {career.failure && career.failure.closures.length > 0 && (
        <ol className="dispatch-closures" aria-label="Out of service, in order">
          {career.failure.closures.map((closure) => (
            <li key={closure.station}>{closureText(net, closure)}</li>
          ))}
        </ol>
      )}
      {abandoned && <p>Ended early — an abandoned Career can't enter the leaderboard.</p>}
      <dl className="dispatch-summary-stats">
        <dt>Score</dt>
        <dd>{careerScore(career)}</dd>
        <dt>Shifts cleared</dt>
        <dd>{career.cleared}</dd>
        <dt>Network</dt>
        <dd>{stations} Stations</dd>
        <dt>Delivered</dt>
        <dd>{totals.delivered}</dd>
        <dt>On time</dt>
        <dd>{Math.round(totals.onTimePct)}%</dd>
        <dt>WPM</dt>
        <dd>{Math.round(metrics.wpm)}</dd>
        <dt>Accuracy</dt>
        <dd>{Math.round(metrics.accuracy * 100)}%</dd>
      </dl>
      <p className="dispatch-summary-lines" aria-label="Lines served">
        {lines.map((code) => {
          const line = net.lines.get(code);
          return line ? <LineBadge key={code} code={code} colour={line.colour} /> : null;
        })}
      </p>

      {!abandoned && !judgement && (
        <p className="dispatch-checking" role="status">Checking your Career…</p>
      )}
      {!abandoned && judgement && (judgement.eligible ? (
        <BoardEntry metrics={metrics} judgement={judgement} onSaved={setRank} />
      ) : (
        // Reasonless on purpose, like the Line Run summary.
        <p className="summary-ineligible" role="status">This Career wasn&apos;t eligible for the leaderboard.</p>
      ))}

      {!abandoned && (
        <ShareButton card={careerCard(net, career, { metrics, verified: Boolean(judgement?.eligible), rank })} />
      )}

      <div className="summary-actions">
        <button type="button" onClick={onAgain}>New Career</button>
        <button type="button" onClick={onBack}>Back to map</button>
      </div>
      <p className="dispatch-credit">{DISPATCH_CREDIT}</p>
    </div>
  );
}
