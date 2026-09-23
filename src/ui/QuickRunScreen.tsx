import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sound } from '../audio/sound';
import type { LineCode } from '../data/types';
import { lineAt, stationAt, type NetworkIndex } from '../engine/network';
import {
  loadProfile, recordQuickBestOverall, recordStation, saveProfile, type Profile,
} from '../engine/progress';
import {
  advanceQuickRun,
  enterQuickCharacter,
  interruptQuickRun,
  prepareQuickRun,
  QUICK_RUN_MS,
  quickRunMetrics,
  quickRunToward,
  type QuickRunState,
} from '../engine/quickRun';
import { followPoints } from '../geo/fit';
import { lineExtent, networkLayout } from '../geo/networkLayout';
import { MapCanvas } from '../render/MapCanvas';
import { Prompt } from '../render/Prompt';
import { prefersReducedMotion } from '../render/useLayoutMode';
import { PlayLayout } from './PlayLayout';
import { QuickRunSummary } from './QuickRunSummary';
import { useGameInput, useTypingInputControls } from './TypingInputProvider';
import { usePhoneLayout } from './usePhoneLayout';
import { useVisualViewport } from './useVisualViewport';
import { runTick, useRunRecorder } from './useRunRecorder';
import { replayQuickRun } from '../engine/replay';
import { verifyKeyLog, type Verdict } from '../engine/integrity';
import { recordIntegrityFail } from '../engine/progress';
import type { KeySource } from '../engine/keylog';
import type { Metrics } from '../engine/metrics';
import './mobile.css';

export interface QuickRunScreenProps {
  net: NetworkIndex;
  line: LineCode;
  toward: string;
  previousStart: string | null;
  onStartingStation: (id: string) => void;
  onBack: () => void;
  random?: () => number;
}

function profileQuickBest(profile: Profile): number | null {
  const value = profile.quickBestOverall;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function formatTimer(seconds: number): string {
  return `0:${String(seconds).padStart(2, '0')}`;
}

/** The map alone waits for the midpoint of the decorative 200 ms jump fade. */
function QuickRunMap({ net, run, visited }: {
  net: NetworkIndex;
  run: QuickRunState;
  visited: readonly string[];
}) {
  const { geo: layout, backdrop, districts } = useMemo(() => networkLayout(), []);
  const latestRun = useRef(run);
  latestRun.current = run;
  const [mapRun, setMapRun] = useState(run);
  const reducedMotion = prefersReducedMotion();

  useEffect(() => {
    if (mapRun.jumpRevision === run.jumpRevision || reducedMotion) setMapRun(run);
  }, [mapRun.jumpRevision, reducedMotion, run]);

  useEffect(() => {
    if (run.jumpRevision === 0 || reducedMotion) return;
    const timeout = window.setTimeout(() => setMapRun(latestRun.current), 100);
    return () => window.clearTimeout(timeout);
  }, [reducedMotion, run.jumpRevision]);

  const activeLine = lineAt(net, mapRun.line);
  const stations = [...(activeLine?.stations ?? [])];
  if (mapRun.direction === -1) stations.reverse();
  const linePositions = lineExtent(stations);
  const currentIndex = stations.indexOf(mapRun.at);
  const followWindow = followPoints(linePositions, currentIndex, { behind: 1, ahead: 2 });
  const previousPoint = mapRun.arrivedFrom ? layout.get(mapRun.arrivedFrom) ?? null : null;
  const currentPoint = layout.get(mapRun.at) ?? null;
  const focus = previousPoint && currentPoint
    ? { x: (previousPoint.x + currentPoint.x) / 2, y: (previousPoint.y + currentPoint.y) / 2 }
    : currentPoint;
  // A travelled polyline is continuous only within one leg, never across a jump.
  const travelled = stations.slice(stations.indexOf(mapRun.activeLeg.at), currentIndex + 1);
  const mapKey = `quick:${mapRun.line}:${mapRun.jumpRevision}`;

  return (
    <div
      key={`${run.line}:${run.jumpRevision}`}
      className="quick-run-map"
      data-jumping={String(run.jumpRevision > 0 && !reducedMotion)}
    >
      <MapCanvas
        key={mapKey}
        net={net}
        layout={layout}
        visited={new Set(visited)}
        activeStation={mapRun.at}
        previousStation={mapRun.arrivedFrom}
        fitTo={linePositions}
        focusTo={followWindow}
        fitKey={mapKey}
        fitPadding={{ top: 0.06, right: 0.06, bottom: 0.34, left: 0.06 }}
        trainProgress={mapRun.typing.target.length > 0 ? mapRun.typing.cursor / mapRun.typing.target.length : 0}
        trainErrorTick={mapRun.errors}
        focus={focus}
        focusKey={mapRun.at}
        backdrop={backdrop}
        districts={districts}
        emphasis={mapRun.line}
        travelled={travelled}
        trainColour={activeLine?.colour ?? null}
      />
    </div>
  );
}

export function QuickRunScreen({
  net,
  line,
  toward,
  previousStart,
  onStartingStation,
  onBack,
  random,
}: QuickRunScreenProps) {
  const randomRef = useRef(random ?? Math.random);
  const [run, setRun] = useState<QuickRunState>(() =>
    prepareQuickRun(net, line, toward, previousStart, randomRef.current));
  const [startedAt] = useState(runTick);
  const recorder = useRunRecorder(startedAt);
  const initialStart = useRef(run.at);
  const currentStart = useRef(run.at);
  const startingCallback = useRef(onStartingStation);
  startingCallback.current = onStartingStation;
  const [displayNow, setDisplayNow] = useState(() => performance.now());
  const [liveMetrics, setLiveMetrics] = useState<Metrics | null>(null);
  const currentRun = useRef(run);
  currentRun.current = run;
  const [profile, setProfile] = useState<Profile>(() => loadProfile());
  const profileRef = useRef(profile);
  const persistedCount = useRef(0);
  const bestAtStart = useRef(profileQuickBest(profile));
  const completionSaved = useRef(false);
  const [summaryBest, setSummaryBest] = useState<number | null>(bestAtStart.current);
  const [newBest, setNewBest] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const heard = useRef({ chars: 0, errors: 0, stations: 0 });
  const completionHeard = useRef(false);
  const { focusInput, blurInput, inputFocused } = useTypingInputControls();
  const phone = usePhoneLayout();
  const { keyboardLikelyOpen } = useVisualViewport();

  const selectedLine = lineAt(net, run.line);

  useEffect(() => {
    startingCallback.current(initialStart.current);
  }, []);

  const onKey = useCallback((key: string, source?: KeySource) => {
    const keyNow = recorder.record(key, source);
    setDisplayNow(keyNow);
    setRun((previous) => enterQuickCharacter(net, previous, key, keyNow, randomRef.current));
  }, [net, recorder]);

  useGameInput(onKey, run.status === 'ready' || run.status === 'running');

  useEffect(() => {
    if (run.status === 'completed' || run.status === 'interrupted') blurInput();
  }, [run.status, blurInput]);

  useEffect(() => {
    if (run.status !== 'running') return;

    const interval = window.setInterval(() => {
      const tickNow = performance.now();
      setDisplayNow(tickNow);
      setRun((previous) => advanceQuickRun(previous, tickNow));
    }, 100);

    return () => window.clearInterval(interval);
  }, [run.status]);

  useEffect(() => {
    if (run.status !== 'running') return;
    const interval = window.setInterval(() => {
      setLiveMetrics(quickRunMetrics(currentRun.current, performance.now()));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [run.status]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'hidden') return;
      if (run.status === 'ready') {
        setDismissed(true);
        onBack();
        return;
      }
      if (run.status === 'running') {
        const hiddenAt = performance.now();
        setDisplayNow(hiddenAt);
        setRun((previous) => interruptQuickRun(previous, hiddenAt));
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [onBack, run.status]);

  useEffect(() => {
    const pending = run.completedStations.slice(persistedCount.current);
    if (pending.length === 0) return;
    persistedCount.current += pending.length;

    let updated = profileRef.current;
    for (const completed of pending) {
      const characters = stationAt(net, completed.id)?.name.length ?? 0;
      const wpm = completed.ms > 0
        ? characters / 5 / (completed.ms / 60_000)
        : 0;
      updated = recordStation(updated, completed.id, wpm);
    }

    profileRef.current = updated;
    saveProfile(updated);
    setProfile(updated);
  }, [net, run.completedStations]);

  useEffect(() => {
    const previous = heard.current;
    if (run.errors > previous.errors) sound.error();
    else if (run.correctChars > previous.chars) sound.key();
    if (run.completedStations.length > previous.stations) sound.arrive();
    heard.current = {
      chars: run.correctChars,
      errors: run.errors,
      stations: run.completedStations.length,
    };
  }, [run.completedStations.length, run.correctChars, run.errors]);

  useEffect(() => {
    if (run.status !== 'completed' || completionHeard.current) return;
    completionHeard.current = true;
    sound.complete();
  }, [run.status]);

  useEffect(() => {
    if (run.status !== 'completed' || completionSaved.current) return;
    completionSaved.current = true;

    // A Quick Run's best is gated on the same evidence a Line Run's board
    // entry is, or instrumenting it would be decorative. The score that gets
    // written is the replayed one, not the live Run's — the two agree for an
    // honest Run, and only the replayed figure is derived from the evidence
    // rather than believed.
    const log = recorder.snapshot();
    const replayed = replayQuickRun(net, { keylog: log, trace: run.trace });

    if (!replayed || !replayed.complete) {
      const updated = recordIntegrityFail(profileRef.current, {
        t: Date.now(), mode: 'quick', reason: 'malformed-log',
      });
      profileRef.current = updated;
      saveProfile(updated);
      setProfile(updated);
      setSummaryBest(bestAtStart.current);
      return;
    }

    const verdict: Verdict = verifyKeyLog(log, replayed.metrics.wpm);

    if (!verdict.ok) {
      const updated = recordIntegrityFail(profileRef.current, {
        t: Date.now(), mode: 'quick', reason: verdict.reason,
      });
      profileRef.current = updated;
      saveProfile(updated);
      setProfile(updated);
      setSummaryBest(bestAtStart.current);
      return;
    }

    const previousBest = bestAtStart.current ?? 0;
    if (replayed.metrics.score <= previousBest) {
      setSummaryBest(bestAtStart.current);
      return;
    }

    const updated = recordQuickBestOverall(profileRef.current, replayed.metrics.score);
    profileRef.current = updated;
    saveProfile(updated);
    setProfile(updated);
    setSummaryBest(replayed.metrics.score);
    setNewBest(true);
  }, [run, net, recorder]);

  const runAgain = useCallback(() => {
    focusInput();
    const next = prepareQuickRun(net, line, toward, currentStart.current, randomRef.current);
    currentStart.current = next.at;
    initialStart.current = next.at;
    recorder.reset(runTick());
    persistedCount.current = 0;
    bestAtStart.current = profileQuickBest(profileRef.current);
    completionSaved.current = false;
    completionHeard.current = false;
    heard.current = { chars: 0, errors: 0, stations: 0 };
    setSummaryBest(bestAtStart.current);
    setNewBest(false);
    setLiveMetrics(null);
    setDisplayNow(performance.now());
    setRun(next);
    startingCallback.current(next.at);
  }, [focusInput, line, net, toward, recorder]);

  if (dismissed) return null;

  const metrics = quickRunMetrics(run, displayNow);
  if (run.status === 'completed' || run.status === 'interrupted') {
    return (
      <QuickRunSummary
        lines={run.trace.legs.map((leg) => leg.line)}
        status={run.status}
        stations={run.completedStations.length}
        metrics={metrics}
        personalBest={summaryBest}
        newBest={newBest}
        onAgain={runAgain}
        onBack={onBack}
      />
    );
  }

  const remainingSeconds = run.status === 'ready' || run.deadline === null
    ? QUICK_RUN_MS / 1000
    : Math.max(0, Math.ceil((run.deadline - displayNow) / 1000));
  const finalSeconds = run.status === 'running' && remainingSeconds <= 10;
  const showRefocus = phone && (!inputFocused || !keyboardLikelyOpen);
  const showJump = run.jumpRevision > 0 && run.at === run.activeLeg.at && run.typing.cursor === 0;

  return (
    <div className="quick-run">
      <PlayLayout
        lineColour={selectedLine?.colour ?? null}
        map={<QuickRunMap net={net} run={run} visited={profile.visited} />}
        panel={
          <>
            <div className="quick-run-context">
              <span>{run.line} · {selectedLine?.name ?? run.line} · toward {quickRunToward(net, run)}</span>
              <time className="quick-run-timer" data-final={String(finalSeconds)}>
                {formatTimer(remainingSeconds)}
              </time>
            </div>
            <dl className="quick-run-metrics">
              <dt>WPM</dt>
              <dd>{liveMetrics ? Math.round(liveMetrics.wpm) : '—'}</dd>
              <dt>Accuracy</dt>
              <dd>{liveMetrics ? `${Math.round(liveMetrics.accuracy * 100)}%` : '—'}</dd>
            </dl>
            {showJump && (
              <p className="quick-run-jump" role="status">
                Jumped to {run.line} · {stationAt(net, run.activeLeg.at)?.name}
              </p>
            )}
            <Prompt state={run.typing} errorTick={run.errors} />
            {showRefocus && (
              <button type="button" className="quick-run-refocus" onClick={focusInput}>
                Tap to continue typing
              </button>
            )}
          </>
        }
      />
    </div>
  );
}
