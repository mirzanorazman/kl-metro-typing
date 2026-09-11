import { useMemo, useState, useEffect, useRef } from 'react';
import { music, sound } from '../audio/sound';
import type { LineCode } from '../data/types';
import { lineAt, stationAt, type NetworkIndex } from '../engine/network';
import { runMetrics, type RunState } from '../engine/run';
import { fitViewBox } from '../geo/fit';
import { networkLayout } from '../geo/networkLayout';
import { evaluateRun, knownNames, loadStore, submitEntry } from '../data/leaderboardStore';
import { LeaderboardPanel } from './LeaderboardPanel';
import type { KeyLog } from '../engine/keylog';
import { verifyKeyLog, type IntegrityReason } from '../engine/integrity';
import { replayLineRun } from '../engine/replay';
import { loadProfile, recordIntegrityFail, saveProfile } from '../engine/progress';
import './summary.css';

export function SummaryScreen({
  net,
  run,
  onExit,
  leaderboardLine = null,
  leaderboardFrom = null,
  keylog = null,
}: {
  net: NetworkIndex;
  run: RunState;
  onExit: () => void;
  leaderboardLine?: LineCode | null;
  /** The terminus the Line Run started from. Needed to replay it. */
  leaderboardFrom?: string | null;
  /** The Run's evidence. Absent for Adventure, which has no board. */
  keylog?: KeyLog | null;
}) {
  useEffect(() => {
    music.startMenu();
    return () => music.stopMenu();
  }, []);

  const times = [...run.stationTimes].sort((a, b) => a.ms - b.ms);
  const fastest = times[0];
  const slowest = times[times.length - 1];
  const elapsed = run.stationTimes.reduce((n, s) => n + s.ms, 0);
  const metrics = runMetrics(run, run.startedAt + elapsed);
  const count = run.stationTimes.length;

  // Get journey points for SVG
  const { geo } = networkLayout();
  const travelledPoints = run.stationTimes.map((st) => {
    const pt = geo.get(st.id);
    return pt || { x: 0, y: 0 };
  });

  const hasJourney = travelledPoints.length > 0;
  const viewBox = hasJourney ? fitViewBox(travelledPoints, 0.15) : null;

  // Get the journey line colour
  const lineColour = run.line ? lineAt(net, run.line)?.colour : null;
  const pathColour = lineColour || 'var(--ink)';

  // The store is read once per summary: a completed run cannot change which
  // scores it is being compared against mid-screen.
  const [store, setStore] = useState(() => loadStore());

  // Eligibility is decided once per summary, from the Run's own evidence. The
  // Metrics that reach the board are the replayed ones, not the ones the Run
  // reported — the two are identical for an honest Run, and only the replayed
  // pair can be re-derived by anyone else later.
  const eligibility = useMemo(() => {
    if (!leaderboardLine || !leaderboardFrom || !keylog) return null;

    const replayed = replayLineRun(net, leaderboardLine, leaderboardFrom, keylog);
    if (!replayed || !replayed.complete) {
      return { ok: false as const, reason: 'malformed-log' as IntegrityReason, metrics: null };
    }

    const verdict = verifyKeyLog(keylog, replayed.metrics.wpm);
    return verdict.ok
      ? { ok: true as const, metrics: replayed.metrics }
      : { ok: false as const, reason: verdict.reason, metrics: replayed.metrics };
  }, [net, leaderboardLine, leaderboardFrom, keylog]);

  // Kept so a false positive is visible in the data. No UI reads it.
  const failRecorded = useRef(false);
  useEffect(() => {
    if (!eligibility || eligibility.ok || failRecorded.current) return;
    failRecorded.current = true;
    saveProfile(recordIntegrityFail(loadProfile(), {
      t: Date.now(), mode: 'line', reason: eligibility.reason,
    }));
  }, [eligibility]);

  const boardMetrics = eligibility?.ok ? eligibility.metrics : null;
  const qualification = useMemo(
    () => (leaderboardLine && boardMetrics ? evaluateRun(net, store, leaderboardLine, boardMetrics) : null),
    [leaderboardLine, net, store, boardMetrics],
  );

  const split = hasJourney && Boolean(leaderboardLine) && eligibility !== null;

  return (
    <div className={`summary${split ? ' summary--wide' : ''}`}>
      <h2>Journey complete</h2>
      <p>{count === 1 ? '1 station' : `${count} stations`} this run</p>

      <div className={`summary-top${split ? ' summary-top--split' : ''}`}>
        {hasJourney && viewBox && (
          <div className="summary-journey">
            <svg
              viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
              role="img"
              aria-label={`Journey through ${count} station${count === 1 ? '' : 's'}`}
            >
              {/* Draw faint network in background */}
              {[...net.lines.values()].map((line) => {
                const pts = line.stations
                  .map((id) => geo.get(id))
                  .filter((p): p is { x: number; y: number } => p !== undefined);
                if (pts.length === 0) return null;
                return (
                  <polyline
                    key={`network-${line.code}`}
                    data-network={line.code}
                    points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
                  />
                );
              })}

              {/* Draw the travelled path */}
              {travelledPoints.length > 0 && (
                <polyline
                  data-journey="true"
                  points={travelledPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                  stroke={pathColour}
                />
              )}

              {/* Draw stations on the journey */}
              {travelledPoints.map((point, idx) => (
                <circle
                  key={`station-${idx}`}
                  data-station="true"
                  cx={point.x}
                  cy={point.y}
                  r="6"
                />
              ))}
            </svg>
          </div>
        )}

        {leaderboardLine && eligibility && (
          <div
            className="summary-side"
            style={{ '--line-colour': lineAt(net, leaderboardLine)?.colour ?? pathColour } as React.CSSProperties}
          >
            {eligibility.ok && qualification && boardMetrics ? (
              <LeaderboardPanel
                qualification={qualification}
                score={boardMetrics.score}
                lineName={lineAt(net, leaderboardLine)?.name ?? leaderboardLine}
                knownNames={knownNames(store)}
                onSubmit={(name) => {
                  const result = submitEntry(net, store, {
                    name,
                    lineCode: leaderboardLine,
                    metrics: boardMetrics,
                    playedAt: Date.now(),
                    verified: true,
                  });
                  setStore(result.store);
                  return { overallRank: result.overallRank, lineRank: result.lineRank };
                }}
              />
            ) : (
              // Deliberately reasonless. An honest player knows something
              // happened and can say so; a cheater gets no gradient to tune
              // against.
              <p className="summary-ineligible" role="status">
                This run wasn&apos;t eligible for the leaderboard.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Stats blocks */}
      <div className="summary-stats">
        <div className="summary-stat">
          <div className="summary-stat-number">{Math.round(metrics.wpm)}</div>
          <div className="summary-stat-label">WPM</div>
        </div>
        <div className="summary-stat">
          <div className="summary-stat-number">{Math.round(metrics.accuracy * 100)}%</div>
          <div className="summary-stat-label">Accuracy</div>
        </div>
        <div className="summary-stat">
          <div className="summary-stat-number">{Math.round(metrics.score)}</div>
          <div className="summary-stat-label">Score</div>
        </div>
      </div>

      {fastest && slowest && (
        <ul>
          <li>Fastest: {stationAt(net, fastest.id)?.name} ({(fastest.ms / 1000).toFixed(1)}s)</li>
          <li>Slowest: {stationAt(net, slowest.id)?.name} ({(slowest.ms / 1000).toFixed(1)}s)</li>
        </ul>
      )}

      <button
        type="button"
        onClick={() => {
          sound.back();
          onExit();
        }}
      >
        Back to the map
      </button>
    </div>
  );
}
