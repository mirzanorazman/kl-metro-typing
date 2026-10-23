import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { music, sound } from '../audio/sound';
import type { Point } from '../data/types';
import type { KeySource } from '../engine/keylog';
import type { NetworkIndex } from '../engine/network';
import {
  SHIFT_MS,
  advanceCareer,
  applyDispatchAction,
  careerTotals,
  dispatchOvercrowded,
  enterDispatchCharacter,
  shiftPhase,
  startCareer,
  type CareerState,
  type DispatchAction,
  type DispatchActionBody,
} from '../engine/dispatch';
import { DISPATCH_KEYLOG_MAX_EVENTS } from '../engine/dispatchBalance';
import { servedKey, servedLines, servedStations } from '../engine/dispatchNetwork';
import { candidates, sameRef, visibleTargets, type Target } from '../engine/dispatchTargets';
import type { TypingState } from '../engine/typing';
import { networkLayout } from '../geo/networkLayout';
import { DispatchOverlay } from '../render/DispatchOverlay';
import { MapCanvas } from '../render/MapCanvas';
import { Prompt } from '../render/Prompt';
import { DispatchIncidents } from './DispatchIncidents';
import { PhoneLandscapeBlock } from './PhoneLandscapeBlock';
import { PlayLayout } from './PlayLayout';
import { useGameInput } from './TypingInputProvider';
import { runTick, useRunRecorder } from './useRunRecorder';
import './dispatch.css';

export interface DispatcherScreenProps {
  net: NetworkIndex;
  onExit: () => void;
  onAgain: () => void;
  phoneLandscape?: boolean;
  /** Test-only: start from this state instead of startCareer. */
  initial?: CareerState;
}

function PauseOverlay({ onResume }: { onResume: () => void }) {
  return (
    <div className="dispatch-paused" role="dialog" aria-label="Paused">
      <h2>Paused</h2>
      <p>The Trains wait at their Signals.</p>
      <button type="button" onClick={onResume}>
        <kbd>Enter</kbd> Resume
      </button>
    </div>
  );
}

/** Placeholder until the Expansion screen lands (Task 10). */
function BetweenShifts({ career, onContinue }: { career: CareerState; onContinue: () => void }) {
  return (
    <div className="dispatch-placeholder" role="region" aria-label="Between Shifts">
      <h2>Shift {career.shift} cleared</h2>
      <button type="button" onClick={onContinue}>Next Shift</button>
    </div>
  );
}

/** Placeholder until the Career summary lands (Task 10). */
function CareerEnded({ onAgain, onExit }: { onAgain: () => void; onExit: () => void }) {
  return (
    <div className="dispatch-placeholder dispatch-ended" role="region" aria-label="Career ended">
      <h2>Career ended</h2>
      <button type="button" onClick={onAgain}>New Career</button>
      <button type="button" onClick={onExit}>Back to map</button>
    </div>
  );
}

const FLOW_TEXT = { inbound: 'inbound', outbound: 'outbound', none: '' } as const;

function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Shift number, phase and peak direction, time left, Delivered and on-time %. */
function ShiftBar({ career }: { career: CareerState }) {
  const shiftMs = career.gameMs - career.shiftStartMs;
  const phase = shiftPhase(shiftMs);
  const totals = careerTotals(career);
  return (
    <header className="dispatch-bar" aria-label="Shift">
      <span className="dispatch-shift">Shift {career.shift}</span>
      <span className="dispatch-phase">
        {phase.name}
        {FLOW_TEXT[phase.flow] && <> · {FLOW_TEXT[phase.flow]}</>}
      </span>
      <span className="dispatch-clock" aria-hidden="true">
        <span style={{ width: `${Math.round(Math.min(1, shiftMs / SHIFT_MS) * 100)}%` }} />
      </span>
      <span className="dispatch-left">{clock(SHIFT_MS - shiftMs)} left</span>
      <dl className="dispatch-stats">
        <dt>Delivered</dt>
        <dd>{totals.delivered}</dd>
        <dt>On time</dt>
        <dd>{Math.round(totals.onTimePct)}%</dd>
      </dl>
    </header>
  );
}

/** The typing line: the aimed text with the usual typed/current/pending treatment. */
function TypingLine({ career, aimed }: { career: CareerState; aimed: readonly Target[] }) {
  const { aim } = career;
  const target = aim.lock ? aimed.find((t) => sameRef(t.ref, aim.lock!)) : aimed[0];
  if (!target) {
    return (
      <p className="dispatch-idle">
        {career.status === 'ready' ? "Type a waiting Station's name to start the Shift" : "Type a waiting Station's name"}
        {aim.mistyped && <span className="prompt-feedback" role="status">Wrong key</span>}
      </p>
    );
  }
  const state: TypingState = {
    target: target.text, cursor: aim.typed.length, keystrokes: 0, errors: 0, mistyped: aim.mistyped, done: false,
  };
  const typed = aim.typed.toLowerCase();
  const exact = aimed.find((t) => t.text.toLowerCase() === typed);
  const longer = aimed.some((t) => t.text.length > typed.length);
  return (
    <>
      <Prompt state={state} errorTick={career.errors} />
      {exact && longer && (
        <p className="dispatch-confirm" role="note"><kbd>Enter</kbd> to clear {exact.text}</p>
      )}
    </>
  );
}

export function DispatcherScreen({ net, onExit, onAgain, phoneLandscape = false, initial }: DispatcherScreenProps) {
  const { geo: layout, backdrop, districts } = useMemo(() => networkLayout(), []);
  const [seed] = useState(() => initial?.seed ?? Math.floor(Math.random() * 2 ** 32));
  const [run, setRun] = useState<CareerState>(() => initial ?? startCareer(net, seed));
  const currentRun = useRef(run);
  const [openedAt] = useState(runTick);
  const recorder = useRunRecorder(openedAt, DISPATCH_KEYLOG_MAX_EVENTS);
  const actions = useRef<DispatchAction[]>([]);

  // Events advance the ref synchronously, and React only ever receives
  // values, so a re-run updater can never apply an input twice.
  const commit = useCallback((next: CareerState) => {
    if (next === currentRun.current) return;
    currentRun.current = next;
    setRun(next);
  }, []);

  /** Applies a non-key action, logging it only if the engine took it. */
  const act = useCallback((body: DispatchActionBody) => {
    const prev = currentRun.current;
    const now = runTick();
    const next = applyDispatchAction(net, prev, body, now);
    if (next === prev) return;
    actions.current.push({ ...body, i: recorder.snapshot().events.length, t: now } as DispatchAction);
    commit(next);
  }, [commit, net, recorder]);

  const onKey = useCallback((key: string, source?: KeySource) => {
    const cur = currentRun.current;
    if (phoneLandscape || cur.status === 'ended' || cur.status === 'between') return;
    if (cur.status === 'paused') {
      if (key === 'Enter' || key === ' ') act({ a: 'resume' });
      return;
    }
    if (key === 'Escape') return act({ a: 'pause' });
    if (key === 'Backspace') return act({ a: 'unlock' });
    if (key === 'Enter') return act({ a: 'confirm' });
    const now = recorder.record(key, source);
    commit(enterDispatchCharacter(net, currentRun.current, key, now));
  }, [act, commit, net, phoneLandscape, recorder]);

  useGameInput(onKey, !phoneLandscape && run.status !== 'ended');

  // The sim advances once per frame; `commit` ignores frames with no new tick.
  useEffect(() => {
    if (run.status !== 'running') return;
    let frame = 0;
    const loop = () => {
      commit(advanceCareer(net, currentRun.current, runTick()));
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [commit, net, run.status]);

  // Only a running Career pauses; between Shifts the clock is already stopped.
  useEffect(() => {
    const pause = () => {
      if (currentRun.current.status === 'running') act({ a: 'pause' });
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') pause();
    };
    window.addEventListener('blur', pause);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', pause);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [act]);

  useLayoutEffect(() => {
    if (phoneLandscape && currentRun.current.status === 'running') act({ a: 'pause' });
  }, [phoneLandscape, act]);

  // Sounds run from effects, never from inside a state update.
  const heard = useRef(run);
  useEffect(() => {
    const prev = heard.current;
    heard.current = run;
    if (prev === run) return;
    if (run.errors > prev.errors) sound.error();
    else if (run.correctChars > prev.correctChars) sound.key();
    if (prev.shift !== run.shift) return;
    const wasWaiting = new Map(prev.sim.trains.filter((t) => t.stage === 'signal').map((t) => [t.id, t]));
    const cleared = run.sim.trains.some((t) => {
      const before = wasWaiting.get(t.id);
      return before && t.stage !== 'signal' && !run.sim.outOfService[net.lines.get(before.line)!.stations[before.at]!];
    });
    const fixed = prev.sim.incidents.some((inc) => {
      const now = run.sim.incidents.find((i) => i.id === inc.id);
      return now ? now.step > inc.step : !run.sim.outOfService[inc.place];
    });
    if (run.sim.delivered > prev.sim.delivered) sound.delivered();
    else if (cleared || fixed) sound.arrive();
    if (run.sim.nextIncidentId > prev.sim.nextIncidentId) sound.warning();
  }, [run, net]);

  // Music only while the Shift runs; it turns tense while anything is wrong.
  const track = run.status !== 'running' ? null : dispatchOvercrowded(run) ? 'rushTense' : 'rushCalm';
  useEffect(() => {
    if (track) music.play(track);
    else music.stop();
  }, [track]);
  useEffect(() => () => music.stop(), []);

  const key = servedKey(run.served);
  const served = useMemo(() => new Set(servedStations(net, run.served)), [net, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const lines = useMemo(() => new Set(servedLines(run.served)), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const frame = useMemo(
    () => [...served].map((id) => layout.get(id)).filter((p): p is Point => p !== undefined),
    [served, layout],
  );

  if (phoneLandscape && run.status !== 'ended') return <PhoneLandscapeBlock fullScreen />;
  if (run.status === 'ended') return <CareerEnded onAgain={onAgain} onExit={onExit} />;

  const targets = visibleTargets(net, run.sim);
  const aimed = run.aim.typed !== '' || run.aim.lock ? candidates(targets, run.aim) : [];
  const lock = run.aim.lock;
  const lockedTrain = lock && lock.kind !== 'fix' ? run.sim.trains.find((t) => t.id === lock.train) : undefined;
  const lineColour = lockedTrain ? net.lines.get(lockedTrain.line)?.colour ?? null : null;

  return (
    <div className="dispatcher">
      <PlayLayout
        lineColour={lineColour}
        map={
          <MapCanvas
            net={net}
            layout={layout}
            visited={served}
            labelled={served}
            activeStation={null}
            backdrop={backdrop}
            districts={districts}
            emphasisSet={lines}
            fitTo={frame}
            fitKey={`dispatch:${key}`}
            fitPadding={{ top: 0.12, right: 0.24, bottom: 0.3, left: 0.06 }}
            overlay={({ layout: l, markScale }) => (
              <DispatchOverlay net={net} layout={l} markScale={markScale} career={run} targets={targets} aimed={aimed} />
            )}
          />
        }
        panel={
          run.status === 'between' ? (
            <BetweenShifts career={run} onContinue={() => act({ a: 'expand', pick: run.offers.length === 0 ? -1 : 0 })} />
          ) : (
            <>
              <TypingLine career={run} aimed={aimed} />
              <p className="hint">
                <kbd>Backspace</kbd> to let go · <kbd>Esc</kbd> to pause
              </p>
              <button type="button" onClick={() => act({ a: 'abandon' })} disabled={run.startedAt === null}>
                End Career
              </button>
              {run.status === 'paused' && <PauseOverlay onResume={() => act({ a: 'resume' })} />}
            </>
          )
        }
      />
      <ShiftBar career={run} />
      <aside className="dispatch-side" aria-label="Incidents panel">
        <DispatchIncidents net={net} career={run} />
      </aside>
    </div>
  );
}
