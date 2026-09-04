import { useEffect, useRef } from 'react';
import { stationAt, type NetworkIndex } from '../engine/network';
import type { LineCode } from '../data/types';

export interface LineStripProps {
  net: NetworkIndex;
  line: LineCode | null;
  at: string;
}

/**
 * The line as a filmstrip, scrolled so the current station stays centred.
 *
 * It renders the whole line rather than a window around the current station:
 * re-slicing on every arrival made the strip jump, whereas scrolling a stable
 * list slides. `scroll-behavior` does the animation, so the global
 * reduced-motion rule turns it off for free.
 */
export function LineStrip({ net, line, at }: LineStripProps) {
  const current = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    // Guard the method, not just the element: jsdom does not implement
    // scrollIntoView, and an unguarded call takes the whole screen down.
    current.current?.scrollIntoView?.({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [at]);

  if (!line) return null;
  const def = net.lines.get(line);
  if (!def) return null;

  return (
    <ol className="line-strip" style={{ '--line-colour': def.colour } as React.CSSProperties}>
      {def.stations.map((id) => {
        const isCurrent = id === at;
        return (
          <li key={id} ref={isCurrent ? current : null} data-current={isCurrent ? 'true' : undefined}>
            {stationAt(net, id)?.name ?? id}
          </li>
        );
      })}
    </ol>
  );
}
