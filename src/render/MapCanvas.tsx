import './map.css';
import type { Layout } from '../geo/layout';
import { linesOf, type NetworkIndex } from '../engine/network';
import { usePanZoom, viewBoxString, type ViewBox } from './usePanZoom';
import { TrainMarker } from './TrainMarker';

export interface MapCanvasProps {
  net: NetworkIndex;
  layout: Layout;
  visited: ReadonlySet<string>;
  activeStation: string | null;
  /** Candidate next stations, highlighted during a junction choice. */
  highlight?: ReadonlySet<string>;
  initialView?: ViewBox;
  /** Station the train is travelling from, for the arrival tween. */
  previousStation?: string | null;
}

const DEFAULT_VIEW: ViewBox = { x: 0, y: 0, w: 1000, h: 800 };

export function MapCanvas({
  net,
  layout,
  visited,
  activeStation,
  highlight,
  initialView = DEFAULT_VIEW,
  previousStation = null,
}: MapCanvasProps) {
  const { view, handlers } = usePanZoom(initialView);

  return (
    <svg
      className="map-canvas"
      viewBox={viewBoxString(view)}
      role="img"
      aria-label="Rapid KL network map"
      {...handlers}
    >
      {[...net.lines.values()].map((line) => {
        const pts = line.stations
          .map((id) => layout.get(id))
          .filter((p): p is NonNullable<typeof p> => p !== undefined)
          .map((p) => `${p.x},${p.y}`)
          .join(' ');
        return (
          <polyline
            key={line.code}
            data-line={line.code}
            points={pts}
            fill="none"
            stroke={line.colour}
            strokeWidth={6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}

      {[...net.stations.values()].map((station) => {
        const p = layout.get(station.id);
        if (!p) return null;
        const isInterchange = linesOf(station).length > 1;
        const isActive = station.id === activeStation;
        const isNext = highlight?.has(station.id) ?? false;
        return (
          <circle
            key={station.id}
            data-station={station.id}
            data-active={isActive ? 'true' : undefined}
            data-next={isNext ? 'true' : undefined}
            data-visited={visited.has(station.id) ? 'true' : undefined}
            cx={p.x}
            cy={p.y}
            r={isActive ? 8 : isInterchange ? 6 : 4}
          >
            <title>
              {station.name} — {linesOf(station).join(', ')}
            </title>
          </circle>
        );
      })}

      <TrainMarker
        from={previousStation ? layout.get(previousStation) ?? null : null}
        to={activeStation ? layout.get(activeStation) ?? null : null}
      />
    </svg>
  );
}
