import type { ReactNode } from 'react';

/**
 * The shared shape of both play modes: map filling the viewport, with a
 * floating panel over the lower third. The map stays visible so the journey
 * is felt; the text being read never moves.
 */
export function PlayLayout({ map, panel }: { map: ReactNode; panel: ReactNode }) {
  return (
    <div className="play">
      {map}
      <div className="play-panel">{panel}</div>
    </div>
  );
}
