import type { LineCode } from '../data/types';
import type { Layout } from '../geo/layout';
import type { NetworkIndex } from '../engine/network';
import { queueCapacity, type RushQueue } from '../engine/rushHour';
import { OVERFLOW_MS } from '../engine/rushBalance';
import { contrastText } from './contrast';

export interface RushQueuesProps {
  net: NetworkIndex;
  layout: Layout;
  markScale: number;
  queues: Readonly<Record<string, RushQueue>>;
}

/** Waiting passengers grouped by target Line, in first-seen order. */
export function groupByTarget(queue: RushQueue): { line: LineCode; count: number }[] {
  const counts = new Map<LineCode, number>();
  for (const p of queue.passengers) counts.set(p.target, (counts.get(p.target) ?? 0) + 1);
  return [...counts].map(([line, count]) => ({ line, count }));
}

/**
 * Each Queue as Line-code chips beside its Station, and each Overflow as a
 * ring that fills clockwise. Chips carry the code as text: colour is never
 * the only signal, and here it is the whole game state.
 */
export function RushQueues({ net, layout, markScale: m, queues }: RushQueuesProps) {
  return (
    <g className="rush-queues">
      {Object.entries(queues).map(([id, queue]) => {
        const p = layout.get(id);
        if (!p || (queue.passengers.length === 0 && queue.overflowMs === 0)) return null;
        const capacity = queueCapacity(net, id);
        const full = queue.passengers.length >= capacity;
        const fill = Math.min(1, queue.overflowMs / OVERFLOW_MS);
        const chipH = 10 * m;
        const chipW = 26 * m;
        const x0 = p.x + 10 * m;
        const y0 = p.y - 16 * m;

        return (
          <g key={id} data-station={id} data-full={full ? 'true' : undefined}>
            {fill > 0 && (
              <>
                <circle className="rush-ring-track" cx={p.x} cy={p.y} r={11 * m} />
                <circle
                  className="rush-ring"
                  data-critical={fill >= 0.5 ? 'true' : undefined}
                  cx={p.x}
                  cy={p.y}
                  r={11 * m}
                  pathLength={1}
                  strokeDasharray={`${fill} 1`}
                  transform={`rotate(-90 ${p.x} ${p.y})`}
                  vectorEffect="non-scaling-stroke"
                />
              </>
            )}
            <text className="rush-count" x={x0} y={y0 - 2 * m} fontSize={8 * m}>
              {queue.passengers.length}/{capacity}
            </text>
            {groupByTarget(queue).map(({ line, count }, i) => {
              const colour = net.lines.get(line)?.colour ?? '#888';
              const x = x0 + i * (chipW + 2 * m);
              return (
                <g key={line} className="rush-chip">
                  <rect x={x} y={y0} width={chipW} height={chipH} rx={2 * m} fill={colour} />
                  <text
                    x={x + chipW / 2}
                    y={y0 + chipH * 0.75}
                    fontSize={7 * m}
                    textAnchor="middle"
                    fill={contrastText(colour)}
                  >
                    {line}×{count}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}
