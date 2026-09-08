import './map.css';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Layout } from '../geo/layout';
import { linesOf, type NetworkIndex } from '../engine/network';
import { usePanZoom, viewBoxString } from './usePanZoom';
import { fitViewBox, type EdgePadding } from '../geo/fit';
import type { Point, LineCode } from '../data/types';
import type { BoundaryPath } from '../geo/boundaries';
import { type District } from '../geo/networkLayout';
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
  /** Stations already typed this run, in order. Inks the stretch behind you. */
  travelled?: readonly string[];
  /** The current line's colour, worn by the train. */
  trainColour?: string | null;
  /** District names to watermark beneath the network. */
  districts?: readonly District[];
  /** Projected units per kilometre. Draws the scale bar when supplied. */
  pxPerKm?: number;
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
  travelled,
  trainColour = null,
  districts,
  pxPerKm,
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

  // Labelling all 154 at once is noise, so labels come in tiers: the stations
  // that orient you always, everything else only once you have zoomed in far
  // enough for it to fit.
  const alwaysLabelled = useMemo(() => {
    const ids = new Set<string>();
    for (const line of net.lines.values()) {
      const first = line.stations[0];
      const last = line.stations[line.stations.length - 1];
      if (first) ids.add(first);
      if (last) ids.add(last);
    }
    for (const station of net.stations.values()) {
      if (linesOf(station).length >= 3) ids.add(station.id);
    }
    return ids;
  }, [net]);

  const showEveryLabel = view.w < 450;

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

        {/* The glow is a blurred copy of the rail beneath the crisp one. Only
            the emphasised line gets it: the filter repaints on every pan and
            zoom, and seven of them is not affordable. */}
        <filter id="track-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
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

      {!showEveryLabel &&
        districts?.map((d) => (
          <text
            key={d.name}
            data-watermark
            className="district-watermark"
            x={d.at.x}
            y={d.at.y}
            fontSize={13 * markScale}
            textAnchor="middle"
            aria-hidden="true"
          >
            {d.name}
          </text>
        ))}

      {emphasis &&
        (() => {
          const line = net.lines.get(emphasis);
          if (!line) return null;
          return (
            <polyline
              className="track-glow"
              points={pointsOf(line.stations)}
              fill="none"
              stroke={line.colour}
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })()}

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

      {travelled && travelled.length > 1 && (
        <polyline
          className="track-done"
          points={pointsOf(travelled)}
          fill="none"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

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
            {(showEveryLabel || alwaysLabelled.has(station.id) || isActive) && (() => {
              // Flip to the left near the right edge of the *live* viewport, so
              // a label never runs off the screen the player has panned to.
              const flip = p.x > view.x + view.w * 0.75;
              return (
                <text
                  data-label={station.id}
                  data-dim={dim}
                  className="station-label"
                  x={p.x + (flip ? -9 : 9) * markScale}
                  y={p.y - 7 * markScale}
                  textAnchor={flip ? 'end' : 'start'}
                  fontSize={11 * markScale}
                  aria-hidden="true"
                >
                  {station.name}
                </text>
              );
            })()}
          </g>
        );
      })}

      {activeStation &&
        emphasis &&
        (() => {
          const p = layout.get(activeStation);
          const colour = net.lines.get(emphasis)?.colour;
          if (!p || !colour) return null;
          return (
            <g data-beacon aria-hidden="true">
              <defs>
                <radialGradient id="beacon-bloom">
                  <stop offset="0%" stopColor={colour} stopOpacity="0.45" />
                  <stop offset="100%" stopColor={colour} stopOpacity="0" />
                </radialGradient>
              </defs>
              <circle
                className="beacon-bloom"
                cx={p.x}
                cy={p.y}
                r={30 * markScale}
                fill="url(#beacon-bloom)"
              />
              <circle
                className="beacon-ring"
                cx={p.x}
                cy={p.y}
                r={22 * markScale}
                fill="none"
                stroke={colour}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })()}

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
        colour={trainColour}
      />

      {pxPerKm !== undefined &&
        (() => {
          // Positioned from the live view rather than the layout, so the
          // furniture stays pinned to the corner while the map pans beneath it.
          const margin = 24 * markScale;
          const x = view.x + margin;
          const y = view.y + view.h - margin;
          // The longest round distance that still fits comfortably on screen.
          const km = [50, 20, 10, 5, 2, 1].find((k) => k * pxPerKm < view.w * 0.18) ?? 1;
          const len = km * pxPerKm;
          const tick = 4 * markScale;

          return (
            <g data-compass className="map-furniture" aria-hidden="true">
              <path
                d={`M ${x} ${y - 34 * markScale} l ${3 * markScale} ${9 * markScale}
                    l ${-3 * markScale} ${-3 * markScale} l ${-3 * markScale} ${3 * markScale} Z`}
              />
              <text x={x} y={y - 38 * markScale} fontSize={9 * markScale} textAnchor="middle">
                N
              </text>
              <path
                d={`M ${x} ${y - tick} L ${x} ${y} L ${x + len} ${y} L ${x + len} ${y - tick}`}
                fill="none"
                vectorEffect="non-scaling-stroke"
              />
              <text
                data-scale-bar
                x={x + len / 2}
                y={y - 6 * markScale}
                fontSize={9 * markScale}
                textAnchor="middle"
              >
                {km} km
              </text>
            </g>
          );
        })()}
    </svg>
  );
}
