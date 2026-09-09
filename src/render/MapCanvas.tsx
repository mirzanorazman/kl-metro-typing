import './map.css';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Layout } from '../geo/layout';
import { linesOf, type NetworkIndex } from '../engine/network';
import { usePanZoom, viewBoxString } from './usePanZoom';
import {
  clampSpan, coverAspect, fitViewBox, scaleToContain, type EdgePadding,
} from '../geo/fit';
import type { Point, LineCode } from '../data/types';
import type { BoundaryPath } from '../geo/boundaries';
import { type District } from '../geo/networkLayout';
import { placeLabels, type LabelCandidate, type Obstacle } from './labels';
import { TrainMarker, tweenPoint } from './TrainMarker';
import { MapBackdrop } from './MapBackdrop';
import { DRAW_EASE, type EntranceTiming } from './entrance';

/** Where the focused point sits vertically; above centre, clear of the panel. */
const FOCUS_BIAS_Y = 0.34;

/** View width the station radii below were chosen against. */
const NOMINAL_VIEW_W = 1000;

/**
 * Span limits for the followed shot, in visible layout units — visible
 * because `coverAspect` has already absorbed the letterboxing by the time
 * these apply.
 *
 * The ceiling does the real work: it stops a long hop on the Putrajaya line —
 * some are 99 units against a 28-unit median — from opening the shot back out
 * into the overview the follow camera exists to avoid. 240 is where a run
 * settles at about six stations across, which is what the design calls for.
 *
 * The floor rarely binds, because `fitViewBox` already refuses to frame
 * anything smaller than 200 units square; it is here for a portrait viewport,
 * where the aspect correction works on the other axis.
 */
const FOLLOW_MIN_SPAN = 160;

/** Breathing room between a station that must stay in shot and the edge. */
const FOLLOW_EDGE_MARGIN = 0.06;

/**
 * Width of one label character as a fraction of the font size.
 *
 * The labels are set in a monospace face, whose advance is 0.6em, plus the
 * 0.08em of letter-spacing the stylesheet adds. Estimating rather than
 * measuring keeps placement a pure calculation, which is what lets it run
 * during render instead of after a layout pass.
 */
const LABEL_CHAR_EM = 0.68;

/** Label box height as a fraction of the font size — roughly the cap height. */
const LABEL_LINE_EM = 0.8;
const FOLLOW_MAX_SPAN = 240;

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
  /**
   * Points that set the zoom of the followed shot. Without this the followed
   * view keeps the size of the `fitTo` frame and only recentres, which on a
   * long line means running the whole way at overview zoom.
   */
  focusTo?: readonly Point[];
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
  /**
   * When set, the network draws itself on rather than appearing whole: each
   * line strokes from terminus to terminus and its stations pop in behind
   * the advancing tip. The canvas only spends the numbers as CSS animation
   * delays; the sequence itself is decided by `entranceTiming`.
   */
  entrance?: EntranceTiming | null;
}

export function MapCanvas({
  net,
  layout,
  visited,
  activeStation,
  highlight,
  previousStation = null,
  fitTo,
  focusTo,
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
  entrance = null,
}: MapCanvasProps) {
  // The followed shot is sized in what the player actually sees, which means
  // knowing the container's shape: preserveAspectRatio letterboxes any box
  // shaped unlike it. 0 means "not measured yet" and disables the correction,
  // which is also the right answer without layout (tests, first paint).
  const svgRef = useRef<SVGSVGElement>(null);
  const [aspect, setAspect] = useState(0);
  useLayoutEffect(() => {
    const measure = () => {
      const rect = svgRef.current?.getBoundingClientRect();
      setAspect(rect && rect.height > 0 ? rect.width / rect.height : 0);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const framed = useMemo(
    () => fitViewBox(fitTo ?? [...layout.values()], fitPadding),
    [fitTo, layout, fitPadding],
  );

  // The size of the followed shot, kept separate from `framed` because the two
  // answer different questions: `framed` is the establishing view of the whole
  // route, this is how much of it you ride with.
  const followed = useMemo(
    () =>
      focusTo && focusTo.length > 0
        ? clampSpan(
            coverAspect(fitViewBox(focusTo, fitPadding), aspect),
            FOLLOW_MIN_SPAN,
            FOLLOW_MAX_SPAN,
          )
        : null,
    [focusTo, fitPadding, aspect],
  );

  // Where the view should be *right now*. When a focus point is given the
  // train is centred at the framed zoom, biased upward to clear the typing
  // panel; otherwise the whole framed extent is shown.
  //
  // This is computed here rather than only inside the effect so it also seeds
  // usePanZoom's initial state — the view is correct on the very first render
  // instead of relying on an effect to correct it afterwards.
  // The stations the shot may not crop: the segment being typed, and any
  // junction candidate the player is being asked to choose between.
  const mustSee = useMemo(() => {
    const ids = [previousStation, activeStation, ...(highlight ?? [])];
    return ids
      .filter((id): id is string => id !== null && id !== undefined)
      .map((id) => layout.get(id))
      .filter((p): p is Point => p !== undefined);
  }, [previousStation, activeStation, highlight, layout]);

  const target = useMemo(() => {
    if (!focus) return framed;

    let size: { w: number; h: number } = followed ?? framed;
    if (followed) {
      // The ceiling is a preference; these stations are a requirement.
      const scale = scaleToContain(size, focus, FOCUS_BIAS_Y, mustSee, FOLLOW_EDGE_MARGIN);
      if (scale > 1) size = { w: size.w * scale, h: size.h * scale };
    }

    return {
      x: focus.x - size.w / 2,
      y: focus.y - size.h * FOCUS_BIAS_Y,
      w: size.w,
      h: size.h,
    };
  }, [focus, framed, followed, mustSee]);
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
    // `aspect` is in here because the first measurement lands after the first
    // paint, and without a refit the opening shot keeps its uncorrected size.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, focusKey, aspect]);

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
  // that orient you always, then major interchanges once the view is not too
  // crowded, then everything once it is genuinely zoomed in.
  const termini = useMemo(() => {
    const ids = new Set<string>();
    for (const line of net.lines.values()) {
      const first = line.stations[0];
      const last = line.stations[line.stations.length - 1];
      if (first) ids.add(first);
      if (last) ids.add(last);
    }
    return ids;
  }, [net]);

  const majorInterchanges = useMemo(() => {
    const ids = new Set<string>();
    for (const station of net.stations.values()) {
      if (linesOf(station).length >= 3) ids.add(station.id);
    }
    return ids;
  }, [net]);

  // How crowded the current view actually is. `view.w` alone cannot answer
  // this: it is in user units, so a line run framing one line reads as
  // "zoomed in" while still holding most of the network on screen.
  const inView = useMemo(
    () =>
      [...layout.values()].filter(
        (p) =>
          p.x >= view.x && p.x <= view.x + view.w &&
          p.y >= view.y && p.y <= view.y + view.h,
      ).length,
    [layout, view],
  );

  const showInterchangeLabels = inView <= 40;
  const showEveryLabel = inView <= 12;

  // Everything that is neither rail nor dot — names, watermarks, the compass
  // and scale bar — waits for the network to finish assembling. Fading them
  // in alongside the draw would put text over a map that is still moving.
  const settledPop = entrance ? 'true' : undefined;
  const settledStyle = entrance
    ? ({ '--pop-delay': `${Math.round(entrance.total)}ms` } as React.CSSProperties)
    : undefined;

  return (
    <svg
      ref={svgRef}
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
            data-pop={settledPop}
            style={settledStyle}
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
        // pathLength normalises the stroke to 1, so the dash that hides the
        // undrawn stretch is written in fractions and needs no measuring.
        const draw = entrance?.line.get(line.code);
        return (
          <polyline
            key={line.code}
            data-line={line.code}
            data-dim={emphasis && line.code !== emphasis ? 'true' : undefined}
            data-draw={draw ? 'true' : undefined}
            pathLength={draw ? 1 : undefined}
            style={
              draw
                ? ({
                    '--draw-delay': `${draw.delay}ms`,
                    '--draw-dur': `${draw.duration}ms`,
                    '--draw-ease': DRAW_EASE.css,
                  } as React.CSSProperties)
                : undefined
            }
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

      {(() => {
        // Labels are collected here rather than rendered inline in each
        // station's <g>, then painted as one group after every station mark:
        // a station rendered later in the loop was painting over an earlier
        // station's text.
        const candidates: LabelCandidate[] = [];
        const dimmed = new Map<string, 'true' | undefined>();
        const named = new Map<string, string>();

        const marks = [...net.stations.values()].map((station) => {
          const p = layout.get(station.id);
          if (!p) return null;
          const codes = linesOf(station);
          const isInterchange = codes.length > 1;
          const isActive = station.id === activeStation;
          const isNext = highlight?.has(station.id) ?? false;
          // A multi-line station takes its first line's colour for the ring;
          // its core is what actually marks it as an interchange.
          const first = codes[0];
          const colour = first ? net.lines.get(first)?.colour : undefined;
          const r = (isActive ? 8 : isInterchange ? 6 : 4) * markScale;
          const dim = emphasis && !codes.includes(emphasis) ? 'true' : undefined;
          const pop = entrance?.station.get(station.id);
          const popStyle =
            pop === undefined
              ? undefined
              : ({ '--pop-delay': `${Math.round(pop)}ms` } as React.CSSProperties);

          // A label for a station well off the viewport is invisible work:
          // it renders a text node nobody sees, and it makes the placement
          // pass below compare every pair of the network's 154 names on every
          // frame of a pan. Half a view of slack keeps labels from popping in
          // at the edge as the map moves.
          const onScreen =
            p.x >= view.x - view.w / 2 && p.x <= view.x + view.w * 1.5 &&
            p.y >= view.y - view.h / 2 && p.y <= view.y + view.h * 1.5;

          if (
            isActive ||
            (onScreen &&
              (showEveryLabel ||
                termini.has(station.id) ||
                (showInterchangeLabels && majorInterchanges.has(station.id))))
          ) {
            // Placement happens once, below, over the whole set: which corner
            // a label can take depends on what its neighbours already took.
            candidates.push({
              id: station.id,
              at: p,
              text: station.name,
              // The station being typed outranks everything, then the marks
              // that orient you; a plain stop yields its corner to both.
              priority: isActive
                ? 3
                : majorInterchanges.has(station.id)
                  ? 2
                  : termini.has(station.id)
                    ? 1
                    : 0,
              required: isActive,
            });
            dimmed.set(station.id, dim);
            named.set(station.id, station.name);
          }

          return (
            <g key={station.id === activeStation ? `${station.id}-active` : station.id}>
              <circle
                data-station={station.id}
                data-active={isActive ? 'true' : undefined}
                data-next={isNext ? 'true' : undefined}
                data-visited={visited.has(station.id) ? 'true' : undefined}
                data-interchange={isInterchange ? 'true' : undefined}
                data-dim={dim}
                data-pop={pop === undefined ? undefined : 'true'}
                style={Object.assign(
                  { '--station-colour': colour } as React.CSSProperties,
                  popStyle,
                )}
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
                  data-pop={pop === undefined ? undefined : 'true'}
                  style={popStyle}
                  cx={p.x}
                  cy={p.y}
                  r={r * 0.45}
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </g>
          );
        });

        // The furniture the names have to work around. Without it a label
        // still cleared its neighbours and then had the train parked on it.
        const furniture: Obstacle[] = [];
        const activeAt = activeStation ? layout.get(activeStation) : undefined;
        if (activeAt && emphasis) {
          // Matches the beacon ring drawn below.
          furniture.push({ x: activeAt.x, y: activeAt.y, r: 22 * markScale });
        }
        if (activeAt) {
          const departedAt = previousStation ? layout.get(previousStation) : undefined;
          const train = departedAt
            ? tweenPoint(departedAt, activeAt, trainProgress ?? 1)
            : activeAt;
          furniture.push({ x: train.x, y: train.y, r: 13 * markScale });
        }

        const fontSize = 11 * markScale;
        const labels = placeLabels(candidates, {
          charWidth: fontSize * LABEL_CHAR_EM,
          lineHeight: fontSize * LABEL_LINE_EM,
          offset: 9 * markScale,
          // The live viewport, so a label near the edge the player has panned
          // to turns inward rather than running off it.
          bounds: view,
          obstacles: furniture,
        });

        return (
          <>
            {marks}
            <g data-labels aria-hidden="true" data-pop={settledPop} style={settledStyle}>
              {labels.map((label) => (
                <text
                  key={label.id}
                  data-label={label.id}
                  data-dim={dimmed.get(label.id)}
                  className="station-label"
                  x={label.x}
                  y={label.y}
                  textAnchor={label.textAnchor}
                  fontSize={fontSize}
                  vectorEffect="non-scaling-stroke"
                >
                  {named.get(label.id)}
                </text>
              ))}
            </g>
          </>
        );
      })()}

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
          const margin = 64 * markScale;
          const x = view.x + margin;
          const y = view.y + view.h - margin;
          // The longest round distance that still fits comfortably on screen.
          const km = [50, 20, 10, 5, 2, 1].find((k) => k * pxPerKm < view.w * 0.18) ?? 1;
          const len = km * pxPerKm;
          const tick = 4 * markScale;

          return (
            <g
              data-compass
              className="map-furniture"
              aria-hidden="true"
              data-pop={settledPop}
              style={settledStyle}
            >
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
