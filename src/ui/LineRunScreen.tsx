import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { loadNetworkData } from '../data/load';
import { sound } from '../audio/sound';
import { networkLayout, lineExtent } from '../geo/networkLayout';
import { followPoints } from '../geo/fit';
import { prefersReducedMotion } from '../render/useLayoutMode';
import { stationAt, type NetworkIndex } from '../engine/network';
import type { LineCode } from '../data/types';
import { endRun, runMetrics, startRun, type RunState } from '../engine/run';
import {
  loadProfile, recordStation, saveProfile, type Profile,
} from '../engine/progress';
import { keyLineRun, lineRunRoute } from '../engine/lineRun';
import { MapCanvas } from '../render/MapCanvas';
import { Prompt } from '../render/Prompt';
import { HUD } from '../render/HUD';
import { LineStrip } from '../render/LineStrip';
import { PlayLayout } from './PlayLayout';
import { PhoneLandscapeBlock } from './PhoneLandscapeBlock';
import { useGameInput, useTypingInputControls } from './TypingInputProvider';
import { usePhoneLayout } from './usePhoneLayout';
import { SummaryScreen } from './SummaryScreen';
import { runTick, useRunRecorder } from './useRunRecorder';
import type { KeySource } from '../engine/keylog';

export interface LineRunScreenProps {
  net: NetworkIndex;
  line: LineCode;
  from: string;
  onExit: () => void;
  phoneLandscape?: boolean;
}

export function LineRunScreen({ net, line, from, onExit, phoneLandscape = false }: LineRunScreenProps) {
  const data = useMemo(() => loadNetworkData(), []);
  const route = useMemo(() => lineRunRoute(net, line, from), [net, line, from]);

  const { geo: layout, backdrop, districts } = networkLayout();


  const [startedAt] = useState(runTick);
  const [run, setRun] = useState<RunState>(() => startRun(net, from, startedAt));
  const recorder = useRunRecorder(startedAt);
  const [profile, setProfile] = useState<Profile>(() => loadProfile());
  const profileRef = useRef(profile);
  const persistedCount = useRef(0);
  const { focusInput, blurInput } = useTypingInputControls();
  const phone = usePhoneLayout();
  const [awaitingPortrait, setAwaitingPortrait] = useState(false);
  const rotationEnded = useRef(false);

  useLayoutEffect(() => {
    if (!phoneLandscape) {
      setAwaitingPortrait(false);
      return;
    }
    if (run.phase === 'ended' || rotationEnded.current) return;
    rotationEnded.current = true;
    blurInput();
    setAwaitingPortrait(true);
    setRun((previous) => endRun(previous));
  }, [phoneLandscape, run, blurInput]);

  // Sound is driven from effects, not from inside the setRun updater — a
  // state updater must stay pure, and React may invoke it more than once.
  const heard = useRef({ chars: 0, errors: 0, stations: 0 });
  useEffect(() => {
    const h = heard.current;
    if (run.errors > h.errors) sound.error();
    else if (run.correctChars > h.chars) sound.key();
    if (run.stationTimes.length > h.stations) sound.arrive();
    heard.current = {
      chars: run.correctChars,
      errors: run.errors,
      stations: run.stationTimes.length,
    };
  }, [run.correctChars, run.errors, run.stationTimes.length]);

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
    const pending = run.stationTimes.slice(persistedCount.current);
    if (pending.length === 0) return;
    persistedCount.current += pending.length;

    let updated = loadProfile();
    for (const station of pending) {
      const chars = stationAt(net, station.id)?.name.length ?? 0;
      const wpm = station.ms > 0 ? chars / 5 / (station.ms / 60_000) : 0;
      updated = recordStation(updated, station.id, wpm);
    }
    profileRef.current = updated;
    saveProfile(updated);
    setProfile(updated);
  }, [run.stationTimes, net]);

  const onKey = useCallback((key: string, source?: KeySource) => {
    if (phoneLandscape || rotationEnded.current) return;
    const now = recorder.record(key, source);
    setRun((prev) => keyLineRun(net, route, prev, key, now));
  }, [net, route, recorder, phoneLandscape]);

  useGameInput(onKey, !phoneLandscape && run.phase === 'typing');

  useEffect(() => {
    if (run.phase === 'ended') blurInput();
  }, [run.phase, blurInput]);

  // Dev-only shortcut to reach the summary screen without typing the whole
  // route by hand. `import.meta.env.DEV` is a build-time constant, so this
  // (and the button that calls it) is stripped entirely from production
  // builds — same pattern as the data-validation check in App.tsx.
  const skipToEnd = useCallback(() => {
    const remaining = [...run.typing.target].slice(run.typing.cursor);
    for (let i = run.stationTimes.length + 1; i < route.length; i++) {
      const id = route[i];
      const name = id ? stationAt(net, id)?.name : undefined;
      if (name) remaining.push(...name);
    }
    remaining.forEach((key) => onKey(key));
  }, [run, route, net, onKey]);

  // Finishing the line earns a moment before the numbers arrive: the sweep
  // plays on the map, then the summary. Skipped entirely under reduced motion.
  const [celebrating, setCelebrating] = useState(false);
  useEffect(() => {
    if (run.phase !== 'ended' || rotationEnded.current) return;
    sound.complete();
    if (prefersReducedMotion()) return;
    setCelebrating(true);
    const t = setTimeout(() => setCelebrating(false), 1100);
    return () => clearTimeout(t);
  }, [run.phase]);

  if (phoneLandscape && (run.phase !== 'ended' || awaitingPortrait)) {
    return <PhoneLandscapeBlock fullScreen />;
  }

  if (run.phase === 'ended' && !celebrating) {
    // Only a fully completed route is leaderboard-eligible — an early "End
    // run" click also sets phase to 'ended', but stationTimes falls short.
    const leaderboardLine = run.stationTimes.length === route.length ? line : null;
    return (
      <SummaryScreen
        net={net}
        run={run}
        onExit={onExit}
        leaderboardLine={leaderboardLine}
        leaderboardFrom={from}
        keylog={recorder.snapshot()}
      />
    );
  }

  // Get positions of this line's stations for fitTo
  const lineStationPositions = lineExtent(route);

  // The stretch you ride with: a couple of stations behind for the sense of
  // ground covered, the next few ahead to read where you are going. Framing
  // the whole route instead meant a 36-station line was run at overview zoom.
  const followWindow = followPoints(
    lineStationPositions,
    run.stationTimes.length,
    { behind: 2, ahead: 3 },
  );

  // Centred on the middle of the segment being typed rather than on the
  // station just left, so the train's run across the shot is centred too. At
  // whole-line zoom the difference was invisible; this close it is not.
  const departed = run.arrivedFrom ? layout.get(run.arrivedFrom) ?? null : null;
  const approaching = layout.get(run.at) ?? null;
  const centre =
    departed && approaching
      ? { x: (departed.x + approaching.x) / 2, y: (departed.y + approaching.y) / 2 }
      : approaching;

  return (
    <PlayLayout
      lineColour={net.lines.get(line)?.colour ?? null}
      map={
        <MapCanvas
          net={net}
          layout={layout}
          visited={new Set(profile.visited)}
          activeStation={run.at}
          previousStation={run.arrivedFrom}
          fitTo={lineStationPositions}
          focusTo={followWindow}
          fitKey={`line:${line}`}
          backdrop={backdrop}
          districts={districts}
          // The train is placed by typing progress, so it arrives exactly as
          // the name is finished. Recentre as each new station begins.
          trainProgress={
            run.typing.target.length > 0
              ? run.typing.cursor / run.typing.target.length
              : 0
          }
          trainErrorTick={run.errors}
          focus={arrived ? centre : null}
          focusKey={arrived ? run.at : 'intro'}
          // Emphasise the line being run: without it every line renders at
          // full strength and you cannot tell which one you are on.
          emphasis={line}
          celebrate={celebrating ? line : null}
          travelled={route.slice(0, run.stationTimes.length + 1)}
          trainColour={net.lines.get(line)?.colour ?? null}
          // The typing panel overlays the lower third of the viewport.
          fitPadding={{ top: 0.06, right: 0.06, bottom: 0.38, left: 0.06 }}
        />
      }
      panel={
        <>
          <LineStrip net={net} line={run.line} at={run.at} />

          {run.phase === 'typing' && (
            <Prompt
              state={run.typing}
              errorTick={run.errors}
              onActivate={phone ? focusInput : undefined}
            />
          )}

          <HUD
            metrics={runMetrics(run, performance.now())}
            stationsThisRun={run.stationTimes.length}
            lineName={data.lines.find((l) => l.code === line)?.name ?? null}
            toward={run.line ? (route[run.stationTimes.length] ? stationAt(net, route[run.stationTimes.length]!)?.name ?? null : null) : null}
          />

          <button type="button" onClick={() => setRun((prev) => endRun(prev))}>
            End run
          </button>

          {import.meta.env.DEV && (
            <button type="button" onClick={skipToEnd}>
              Skip to end (dev)
            </button>
          )}
        </>
      }
    />
  );
}
