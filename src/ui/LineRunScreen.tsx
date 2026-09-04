import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadNetworkData } from '../data/load';
import { networkLayout, lineExtent } from '../geo/networkLayout';
import { prefersReducedMotion } from '../render/useLayoutMode';
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

export interface LineRunScreenProps {
  net: NetworkIndex;
  line: LineCode;
  from: string;
  onExit: () => void;
}

export function LineRunScreen({ net, line, from, onExit }: LineRunScreenProps) {
  const data = useMemo(() => loadNetworkData(), []);
  const route = useMemo(() => lineRunRoute(net, line, from), [net, line, from]);

  const { geo: layout, backdrop } = networkLayout();


  const [run, setRun] = useState<RunState>(() => startRun(net, from, performance.now()));
  const [profile, setProfile] = useState<Profile>(() => loadProfile());
  const persistedCount = useRef(0);

  // The run opens framed on the whole line — matching what the map was showing
  // when you picked it — then eases in to centre the train. Without this beat
  // the view arrives already centred and the move reads as a jump.
  const [arrived, setArrived] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setArrived(true), 80);
    return () => clearTimeout(t);
  }, []);

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

  // Finishing the line earns a moment before the numbers arrive: the sweep
  // plays on the map, then the summary. Skipped entirely under reduced motion.
  const [celebrating, setCelebrating] = useState(false);
  useEffect(() => {
    if (run.phase !== 'ended' || prefersReducedMotion()) return;
    setCelebrating(true);
    const t = setTimeout(() => setCelebrating(false), 1100);
    return () => clearTimeout(t);
  }, [run.phase]);

  if (run.phase === 'ended' && !celebrating) {
    return <SummaryScreen net={net} run={run} onExit={onExit} />;
  }

  // Get positions of this line's stations for fitTo
  const lineStationPositions = lineExtent(route);

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
          // The train is placed by typing progress, so it arrives exactly as
          // the name is finished. Recentre as each new station begins.
          trainProgress={
            run.typing.target.length > 0
              ? run.typing.cursor / run.typing.target.length
              : 0
          }
          trainErrorTick={run.errors}
          focus={arrived ? layout.get(run.arrivedFrom ?? run.at) ?? null : null}
          focusKey={arrived ? run.at : 'intro'}
          // Emphasise the line being run: without it every line renders at
          // full strength and you cannot tell which one you are on.
          emphasis={line}
          celebrate={celebrating ? line : null}
          // The typing panel overlays the lower third of the viewport.
          fitPadding={{ top: 0.06, right: 0.06, bottom: 0.38, left: 0.06 }}
        />
      }
      panel={
        <>
          <LineStrip net={net} line={run.line} at={run.at} />

          {run.phase === 'typing' && <Prompt state={run.typing} errorTick={run.errors} />}

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
