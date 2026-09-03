import { stationAt, type NetworkIndex } from '../engine/network';
import { runMetrics, type RunState } from '../engine/run';

export function SummaryScreen({
  net,
  run,
  onExit,
}: {
  net: NetworkIndex;
  run: RunState;
  onExit: () => void;
}) {
  const times = [...run.stationTimes].sort((a, b) => a.ms - b.ms);
  const fastest = times[0];
  const slowest = times[times.length - 1];
  const elapsed = run.stationTimes.reduce((n, s) => n + s.ms, 0);
  const metrics = runMetrics(run, run.startedAt + elapsed);
  const count = run.stationTimes.length;

  return (
    <div className="summary">
      <h2>Journey complete</h2>
      <p>{count === 1 ? '1 station' : `${count} stations`} this run</p>
      <dl>
        <dt>WPM</dt><dd>{Math.round(metrics.wpm)}</dd>
        <dt>Accuracy</dt><dd>{Math.round(metrics.accuracy * 100)}%</dd>
        <dt>Score</dt><dd>{Math.round(metrics.score)}</dd>
      </dl>
      {fastest && slowest && (
        <ul>
          <li>Fastest: {stationAt(net, fastest.id)?.name} ({(fastest.ms / 1000).toFixed(1)}s)</li>
          <li>Slowest: {stationAt(net, slowest.id)?.name} ({(slowest.ms / 1000).toFixed(1)}s)</li>
        </ul>
      )}
      <button type="button" onClick={onExit}>Back to the map</button>
    </div>
  );
}
