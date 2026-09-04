import { useEffect } from 'react';
import { music, sound } from '../audio/sound';
import { lineAt, stationAt, type NetworkIndex } from '../engine/network';
import { runMetrics, type RunState } from '../engine/run';
import { fitViewBox } from '../geo/fit';
import { networkLayout } from '../geo/networkLayout';
import './summary.css';

export function SummaryScreen({
  net,
  run,
  onExit,
}: {
  net: NetworkIndex;
  run: RunState;
  onExit: () => void;
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
  const pathColour = lineColour || 'var(--accent)';

  return (
    <div className="summary">
      <h2>Journey complete</h2>
      <p>{count === 1 ? '1 station' : `${count} stations`} this run</p>

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
