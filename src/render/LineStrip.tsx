import { stationAt, type NetworkIndex } from '../engine/network';
import type { LineCode } from '../data/types';

export interface LineStripProps {
  net: NetworkIndex;
  line: LineCode | null;
  at: string;
  /** How many stations to show either side of the current one. */
  span?: number;
}

export function LineStrip({ net, line, at, span = 4 }: LineStripProps) {
  if (!line) return null;
  const def = net.lines.get(line);
  const idx = net.order.get(line)?.get(at);
  if (!def || idx === undefined) return null;

  const from = Math.max(0, idx - span);
  const slice = def.stations.slice(from, idx + span + 1);

  return (
    <ol className="line-strip" style={{ '--line-colour': def.colour } as React.CSSProperties}>
      {slice.map((id) => (
        <li key={id} data-current={id === at ? 'true' : undefined}>
          {stationAt(net, id)?.name ?? id}
        </li>
      ))}
    </ol>
  );
}
