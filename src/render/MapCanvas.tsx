import './map.css';
import { useEffect, useMemo, useRef } from 'react';
import type { Layout } from '../geo/layout';
import { linesOf, type NetworkIndex } from '../engine/network';
import { usePanZoom, viewBoxString } from './usePanZoom';
import { fitViewBox, type EdgePadding } from '../geo/fit';
import type { Point, LineCode } from '../data/types';
import type { BoundaryPath } from '../geo/boundaries';
import { TrainMarker } from './TrainMarker';
import { MapBackdrop } from './MapBackdrop';

/** Where the focused point sits vertically; above centre, clear of the panel. */
const FOCUS_BIAS_Y = 0.34;

export interface MapCanvasProps {
  net: NetworkIndex;
  layout: Layout;
  visited: ReadonlySet<string>;
  activeStation: string | null;
  /** Candidate next stations, highlighted during a junction choice. */
  highlight?: ReadonlySet<string>;
  /** Station the train is travelling from, for the arrival tween. */
  previousStation?: string | null;
  /** Points to frame. Defaults to every point in `layout`. */
  fitTo?: readonly Point[];
  /** Changing this reframes the view. Use something like `${mode}:${line ?? 'all'}`. */
  fitKey?: string;
  /** Per-side padding, to keep content clear of overlaying panels. */
  fitPadding?: number | EdgePadding;
  /** How far through the current station's name, 0..1. Drives the train. */
  trainProgress?: number;
  /** Increments on every mistyped key; shakes the train. */
  trainErrorTick?: number;
  /** Point to recentre on when `focusKey` changes. */
  focus?: Point | null;
  /** Changing this recentres the view on `focus`. */
  focusKey?: string;
  /** Land outlines to draw beneath the tracks. */
  backdrop?: BoundaryPath[];
  /** When set, this line is emphasised and the others are dimmed. */
  emphasis?: LineCode | null;
}

export function MapCanvas({
  net,
  layout,
  visited,
  activeStation,
  highlight,
  previousStation = null,
  fitTo,
  fitKey,
  fitPadding = 0.08,
  trainProgress,
  trainErrorTick,
  focus,
  focusKey,
  backdrop,
  emphasis,
}: MapCanvasProps) {
  const framed = useMemo(
    () => fitViewBox(fitTo ?? [...layout.values()], fitPadding),
    [fitTo, layout, fitPadding],
  );

  // Where the view should be *right now*. When a focus point is given the
  // train is centred at the framed zoom, biased upward to clear the typing
  // panel; otherwise the whole framed extent is shown.
  //
  // This is computed here rather than only inside the effect so it also seeds
  // usePanZoom's initial state — the view is correct on the very first render
  // instead of relying on an effect to correct it afterwards.
  const target = useMemo(
    () =>
      focus
        ? {
            x: focus.x - framed.w / 2,
            y: focus.y - framed.h * FOCUS_BIAS_Y,
            w: framed.w,
            h: framed.h,
          }
        : framed,
    [focus, framed],
  );
  const { view, fit, handlers } = usePanZoom(target);

  const framedOnce = useRef(false);

  useEffect(() => {
    fit(target, { animate: framedOnce.current });
    framedOnce.current = true;
    // Keyed reframing only: `target` changes identity on every render, and
    // refitting then would fight both the layout tween and the player's pan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, focusKey]);

  return (
    <svg
      className="map-canvas"
      viewBox={viewBoxString(view)}
      role="img"
      aria-label="Rapid KL network map"
      {...handlers}
    >
      {backdrop && <MapBackdrop paths={backdrop} />}
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
            data-dim={emphasis && line.code !== emphasis ? 'true' : undefined}
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
            key={station.id === activeStation ? `${station.id}-active` : station.id}
            data-station={station.id}
            data-active={isActive ? 'true' : undefined}
            data-next={isNext ? 'true' : undefined}
            data-visited={visited.has(station.id) ? 'true' : undefined}
            // Dots must dim with their lines, or the de-emphasised lines
            // still shout through their stations.
            data-dim={
              emphasis && !linesOf(station).includes(emphasis) ? 'true' : undefined
            }
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
        progress={trainProgress}
        errorTick={trainErrorTick}
      />
    </svg>
  );
}
