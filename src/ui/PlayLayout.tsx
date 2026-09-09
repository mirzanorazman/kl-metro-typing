import type { CSSProperties, ReactNode } from 'react';

/**
 * The shared shape of both play modes: map filling the viewport, with a
 * floating panel over the lower third. The map stays visible so the journey
 * is felt; the text being read never moves.
 *
 * The panel carries the current line's colour as `--line-colour`, which the
 * typing prompt's cursor and the panel's own edge both resolve from — so the
 * chrome recolours itself as the run changes line.
 */
export function PlayLayout({
  map,
  panel,
  lineColour = null,
}: {
  map: ReactNode;
  panel: ReactNode;
  lineColour?: string | null;
}) {
  return (
    <div className="play">
      {map}
      <div
        className="play-panel"
        style={lineColour ? ({ '--line-colour': lineColour } as CSSProperties) : undefined}
      >
        {panel}
      </div>
    </div>
  );
}
