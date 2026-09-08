import './map.css';
import { useCallback, useEffect, useMemo, useRef } from 'react';
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

/** View width the station radii below were chosen against. */
const NOMINAL_VIEW_W = 1000;

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
  /** When set, a pulse sweeps the length of this line. Set on completion. */
  celebrate?: LineCode | null;
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
  celebrate,
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

  // Radii are in SVG user units, so they inflate as the view zooms in — a
  // short line like the Monorail frames tightly and the dots ballooned. Scale
  // them against the view so their on-screen size stays constant. Strokes are
  // handled by vector-effect instead, which pins them to CSS pixels.
  const markScale = Math.max(0.15, Math.min(1.6, view.w / NOMINAL_VIEW_W));

  const framedOnce = useRef(false);

  useEffect(() => {
    fit(target, { animate: framedOnce.current });
    framedOnce.current = true;
    // Keyed reframing only: `target` changes identity on every render, and
    // refitting then would fight both the layout tween and the player's pan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, focusKey]);

  // Every polyline in this canvas is the same transformation of a station
  // list; later marks (the glow, the travelled stretch) reuse it.
  const pointsOf = useCallback(
    (ids: readonly string[]) =>
      ids
        .map((id) => layout.get(id))
        .filter((p): p is Point => p !== undefined)
        .map((p) => `${p.x},${p.y}`)
        .join(' '),
    [layout],
  );

  return (
    <svg
      className="map-canvas"
      viewBox={viewBoxString(view)}
      role="img"
      aria-label="Rapid KL network map"
      {...handlers}
    >
      <defs>
        {/* Anchored in user space, so the grid pans with the map for free; the
            tile scales with the view, so its density on screen never changes. */}
        <pattern
          id="drafting-grid"
          width={28 * markScale}
          height={28 * markScale}
          patternUnits="userSpaceOnUse"
        >
          <circle
            className="grid-dot"
            cx={2 * markScale}
            cy={2 * markScale}
            r={0.95 * markScale}
          />
        </pattern>
      </defs>

      <rect
        data-grid
        x={view.x}
        y={view.y}
        width={view.w}
        height={view.h}
        fill="url(#drafting-grid)"
      />

      {backdrop && <MapBackdrop paths={backdrop} />}
      {[...net.lines.values()].map((line) => {
        const pts = pointsOf(line.stations);
        return (
          <polyline
            key={line.code}
            data-line={line.code}
            data-dim={emphasis && line.code !== emphasis ? 'true' : undefined}
            points={pts}
            fill="none"
            stroke={line.colour}
            strokeWidth={6}
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}

      {[...net.stations.values()].map((station) => {
        const p = layout.get(station.id);
        if (!p) return null;
        const codes = linesOf(station);
        const isInterchange = codes.length > 1;
        const isActive = station.id === activeStation;
        const isNext = highlight?.has(station.id) ?? false;
        // A multi-line station takes its first line's colour for the ring; its
        // core is what actually marks it as an interchange.
        const first = codes[0];
        const colour = first ? net.lines.get(first)?.colour : undefined;
        const r = (isActive ? 8 : isInterchange ? 6 : 4) * markScale;
        const dim = emphasis && !codes.includes(emphasis) ? 'true' : undefined;

        return (
          <g key={station.id === activeStation ? `${station.id}-active` : station.id}>
            <circle
              data-station={station.id}
              data-active={isActive ? 'true' : undefined}
              data-next={isNext ? 'true' : undefined}
              data-visited={visited.has(station.id) ? 'true' : undefined}
              data-interchange={isInterchange ? 'true' : undefined}
              data-dim={dim}
              style={{ '--station-colour': colour } as React.CSSProperties}
              cx={p.x}
              cy={p.y}
              r={r}
              vectorEffect="non-scaling-stroke"
            >
              <title>
                {station.name} — {codes.join(', ')}
              </title>
            </circle>
            {isInterchange && (
              <circle
                data-core={station.id}
                data-dim={dim}
                cx={p.x}
                cy={p.y}
                r={r * 0.45}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </g>
        );
      })}

      {celebrate &&
        (() => {
          const line = net.lines.get(celebrate);
          if (!line) return null;
          const pts = pointsOf(line.stations);
          return (
            <polyline
              className="line-sweep"
              points={pts}
              stroke={line.colour}
              vectorEffect="non-scaling-stroke"
              // Normalising the path length to 1 lets the dash animate in
              // fractions, with no need to measure the path in JavaScript.
              pathLength={1}
            />
          );
        })()}

      <TrainMarker
        from={previousStation ? layout.get(previousStation) ?? null : null}
        to={activeStation ? layout.get(activeStation) ?? null : null}
        scale={markScale}
        progress={trainProgress}
        errorTick={trainErrorTick}
      />
    </svg>
  );
}
