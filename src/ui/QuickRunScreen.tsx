import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sound } from '../audio/sound';
import type { LineCode } from '../data/types';
import { lineAt, stationAt, type NetworkIndex } from '../engine/network';
import {
  loadProfile, recordQuickBest, recordStation, saveProfile, type Profile,
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

function profileQuickBest(profile: Profile, line: LineCode): number | null {
  const value = profile.quickBest[line];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function formatTimer(seconds: number): string {
  return `0:${String(seconds).padStart(2, '0')}`;
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
  const [profile, setProfile] = useState<Profile>(() => loadProfile());
  const profileRef = useRef(profile);
  const persistedCount = useRef(0);
  const bestAtStart = useRef(profileQuickBest(profile, line));
  const completionSaved = useRef(false);
  const [summaryBest, setSummaryBest] = useState<number | null>(bestAtStart.current);
  const [newBest, setNewBest] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const heard = useRef({ chars: 0, errors: 0, stations: 0 });
  const completionHeard = useRef(false);
  const { focusInput, blurInput, inputFocused } = useTypingInputControls();
  const phone = usePhoneLayout();
  const { keyboardLikelyOpen } = useVisualViewport();

  const { geo: layout, backdrop, districts } = useMemo(() => networkLayout(), []);
  const selectedLine = lineAt(net, line);

  useEffect(() => {
    startingCallback.current(initialStart.current);
  }, []);

  const onKey = useCallback((key: string, source?: KeySource) => {
    const keyNow = recorder.record(key, source);
    setDisplayNow(keyNow);
    setRun((previous) => enterQuickCharacter(net, previous, key, keyNow));
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
    const replayed = replayQuickRun(net, line, initialStart.current, run.initialToward, log);

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

    const updated = recordQuickBest(profileRef.current, line, replayed.metrics.score);
    profileRef.current = updated;
    saveProfile(updated);
    setProfile(updated);
    setSummaryBest(replayed.metrics.score);
    setNewBest(true);
  }, [displayNow, line, run, net, recorder]);

  const runAgain = useCallback(() => {
    focusInput();
    const next = prepareQuickRun(net, line, toward, currentStart.current, randomRef.current);
    currentStart.current = next.at;
    initialStart.current = next.at;
    recorder.reset(runTick());
    persistedCount.current = 0;
    bestAtStart.current = profileQuickBest(profileRef.current, line);
    completionSaved.current = false;
    completionHeard.current = false;
    heard.current = { chars: 0, errors: 0, stations: 0 };
    setSummaryBest(bestAtStart.current);
    setNewBest(false);
    setDisplayNow(performance.now());
    setRun(next);
    startingCallback.current(next.at);
  }, [focusInput, line, net, toward, recorder]);

  if (dismissed) return null;

  const metrics = quickRunMetrics(run, displayNow);
  if (run.status === 'completed' || run.status === 'interrupted') {
    return (
      <QuickRunSummary
        lineName={selectedLine?.name ?? line}
        status={run.status}
        stations={run.completedStations.length}
        metrics={metrics}
        personalBest={run.status === 'completed' && newBest ? metrics.score : summaryBest}
        newBest={newBest}
        onAgain={runAgain}
        onBack={onBack}
      />
    );
  }

  const linePositions = lineExtent(selectedLine?.stations ?? []);
  const currentIndex = selectedLine?.stations.indexOf(run.at) ?? -1;
  const followWindow = followPoints(linePositions, currentIndex, { behind: 2, ahead: 3 });
  const previousPoint = run.arrivedFrom ? layout.get(run.arrivedFrom) ?? null : null;
  const currentPoint = layout.get(run.at) ?? null;
  const focus = previousPoint && currentPoint
    ? {
        x: (previousPoint.x + currentPoint.x) / 2,
        y: (previousPoint.y + currentPoint.y) / 2,
      }
    : currentPoint;
  const remainingSeconds = run.status === 'ready' || run.deadline === null
    ? QUICK_RUN_MS / 1000
    : Math.max(0, Math.ceil((run.deadline - displayNow) / 1000));
  const finalSeconds = run.status === 'running' && remainingSeconds <= 10;
  const showRefocus = phone && (!inputFocused || !keyboardLikelyOpen);

  return (
    <div className="quick-run">
      <PlayLayout
        lineColour={selectedLine?.colour ?? null}
        map={
          <MapCanvas
            net={net}
            layout={layout}
            visited={new Set(profile.visited)}
            activeStation={run.at}
            previousStation={run.arrivedFrom}
            fitTo={linePositions}
            focusTo={followWindow}
            fitKey={`quick:${line}`}
            fitPadding={{ top: 0.06, right: 0.06, bottom: 0.34, left: 0.06 }}
            trainProgress={run.typing.target.length > 0 ? run.typing.cursor / run.typing.target.length : 0}
            trainErrorTick={run.errors}
            focus={focus}
            focusKey={run.at}
            backdrop={backdrop}
            districts={districts}
            emphasis={line}
            travelled={[...run.completedStations.map((station) => station.id), run.at]}
            trainColour={selectedLine?.colour ?? null}
          />
        }
        panel={
          <>
            <div className="quick-run-context">
              <span>{selectedLine?.name ?? line} · toward {quickRunToward(net, run)}</span>
              <time className="quick-run-timer" data-final={String(finalSeconds)}>
                {formatTimer(remainingSeconds)}
              </time>
            </div>
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
