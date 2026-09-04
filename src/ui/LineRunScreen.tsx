import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadNetworkData } from '../data/load';
import { loadBoundaries, projectBoundaries } from '../geo/boundaries';
import { makeProjection } from '../geo/project';
import { stationAt, type NetworkIndex } from '../engine/network';
import type { LineCode } from '../data/types';
import {
  chooseTowards, endRun, keyRun, runMetrics, startRun, type RunState,
} from '../engine/run';
import {
  loadProfile, recordStation, saveProfile, type Profile,
} from '../engine/progress';
import { lineRunRoute } from '../engine/lineRun';
import { MapCanvas } from '../render/MapCanvas';
import { Prompt } from '../render/Prompt';
import { HUD } from '../render/HUD';
import { LineStrip } from '../render/LineStrip';
import { PlayLayout } from './PlayLayout';
import { useKeyboard } from './useKeyboard';
import { SummaryScreen } from './SummaryScreen';

const VIEWPORT = { width: 1000, height: 800, padding: 60 };

export interface LineRunScreenProps {
  net: NetworkIndex;
  line: LineCode;
  from: string;
  onExit: () => void;
}

export function LineRunScreen({ net, line, from, onExit }: LineRunScreenProps) {
  const data = useMemo(() => loadNetworkData(), []);
  const route = useMemo(() => lineRunRoute(net, line, from), [net, line, from]);

  // Create a projection fitted to this line's stations
  const layout = useMemo(() => {
    const lineStations = route.map((stationId) => {
      const station = stationAt(net, stationId);
      return station?.geo ?? { lat: 0, lng: 0 };
    });
    const proj = makeProjection(lineStations, VIEWPORT);
    // Project all stations (not just the line stations, for full network map)
    const result = new Map<string, { x: number; y: number }>();
    for (const [id, station] of net.stations) {
      result.set(id, proj.project(station.geo));
    }
    return result;
  }, [net, route]);

  // Project boundaries with the same projection instance
  const backdrop = useMemo(() => {
    const lineStations = route.map((stationId) => {
      const station = stationAt(net, stationId);
      return station?.geo ?? { lat: 0, lng: 0 };
    });
    const proj = makeProjection(lineStations, VIEWPORT);
    return projectBoundaries(loadBoundaries(), proj);
  }, [net, route]);

  const [run, setRun] = useState<RunState>(() => startRun(net, from, performance.now()));
  const [profile, setProfile] = useState<Profile>(() => loadProfile());
  const persistedCount = useRef(0);

  // Persist after each arrival, in an effect rather than inside the setRun
  // updater. Calling setState from within another state updater is a
  // render-phase update: React warns about it and it can loop. The counter
  // guard also makes the effect idempotent, so the setProfile it performs
  // cannot re-trigger it.
  useEffect(() => {
    if (run.stationTimes.length === persistedCount.current) return;
    persistedCount.current = run.stationTimes.length;

    const last = run.stationTimes[run.stationTimes.length - 1];
    if (!last) return;

    const chars = stationAt(net, last.id)?.name.length ?? 0;
    const wpm = last.ms > 0 ? chars / 5 / (last.ms / 60_000) : 0;
    const updated = recordStation(profile, last.id, wpm);
    saveProfile(updated);
    setProfile(updated);
  }, [run, net, profile]);

  const onKey = useCallback((key: string) => {
    setRun((prev) => {
      if (prev.phase !== 'typing') return prev;
      let next = keyRun(net, prev, key, performance.now());

      // Route complete: end here rather than letting the engine reverse at the terminus.
      if (next.stationTimes.length >= route.length) return endRun(next);

      // Interchange: stay on the line instead of prompting.
      if (next.phase === 'junction') {
        const target = route[next.stationTimes.length];
        if (target) next = chooseTowards(net, next, target, performance.now());
      }
      return next;
    });
  }, [net, route]);

  useKeyboard(onKey, run.phase === 'typing');

  if (run.phase === 'ended') {
    return <SummaryScreen net={net} run={run} onExit={onExit} />;
  }

  // Get positions of this line's stations for fitTo
  const lineStationPositions = route
    .map((id) => layout.get(id))
    .filter((p): p is NonNullable<typeof p> => p !== undefined);

  return (
    <PlayLayout
      map={
        <MapCanvas
          net={net}
          layout={layout}
          visited={new Set(profile.visited)}
          activeStation={run.at}
          previousStation={run.arrivedFrom}
          fitTo={lineStationPositions}
          fitKey={`line:${line}`}
          backdrop={backdrop}
        />
      }
      panel={
        <>
          <LineStrip net={net} line={run.line} at={run.at} />

          {run.phase === 'typing' && <Prompt state={run.typing} />}

          <HUD
            metrics={runMetrics(run, performance.now())}
            stationsThisRun={run.stationTimes.length}
            lineName={data.lines.find((l) => l.code === line)?.name ?? null}
            toward={run.line ? (route[run.stationTimes.length] ? stationAt(net, route[run.stationTimes.length]!)?.name ?? null : null) : null}
          />

          <button type="button" onClick={() => setRun((prev) => endRun(prev))}>
            End run
          </button>
        </>
      }
    />
  );
}
