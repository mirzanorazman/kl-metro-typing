import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { music, sound } from '../audio/sound';
import type { Point } from '../data/types';
import type { KeySource } from '../engine/keylog';
import type { NetworkIndex } from '../engine/network';
import { loadProfile, markDispatchTipSeen, recordIntegrityFail, saveProfile } from '../engine/progress';
import {
  DISPATCH_EVIDENCE_VERSION,
  SHIFT_MS,
  advanceCareer,
  applyDispatchAction,
  careerMetrics,
  careerTotals,
  dispatchTense,
  enterDispatchCharacter,
  shiftPhase,
  startCareer,
  type CareerState,
  type DispatchAction,
  type DispatchActionBody,
} from '../engine/dispatch';
import { DISPATCH_KEYLOG_MAX_EVENTS } from '../engine/dispatchBalance';
import { judgeCareer, type DispatchJudgement } from '../engine/dispatchJudge';
import { servedKey, servedLines, servedStations } from '../engine/dispatchNetwork';
import { candidates, sameRef, visibleTargets, type Target } from '../engine/dispatchTargets';
import type { TypingState } from '../engine/typing';
import { networkLayout } from '../geo/networkLayout';
import { DispatchOverlay } from '../render/DispatchOverlay';
import { MapCanvas } from '../render/MapCanvas';
import { Prompt } from '../render/Prompt';
import { ConfirmEndButton } from './ConfirmEndButton';
import { DispatchExpansion } from './DispatchExpansion';
import { DispatchIncidents } from './DispatchIncidents';
import { DispatchSummary } from './DispatchSummary';
import { dispatchTipText, newDispatchTips, type DispatchTipId } from './dispatchTips';
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

/** A one-time tip. A running Career is paused while it shows; any key or click dismisses it. */
function TipCard({ id, onDismiss }: { id: DispatchTipId; onDismiss: () => void }) {
  return (
    <div className="dispatch-paused dispatch-tip" role="dialog" aria-label="Tip">
      <p>{dispatchTipText(id)}</p>
      <button type="button" onClick={onDismiss}>
        <kbd>any key</kbd> Got it
      </button>
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

/**
 * The typing line: the aimed text with the usual typed/current/pending
 * treatment. While a wrong key's stall runs, keys are dropped, so the line
 * says so: it dims and shows "Wait…" until the Shift clock passes the stall.
 */
function TypingLine({ career, aimed }: { career: CareerState; aimed: readonly Target[] }) {
  const { aim } = career;
  const stalled = career.gameMs < aim.stallUntil;
  const target = aim.lock ? aimed.find((t) => sameRef(t.ref, aim.lock!)) : aimed[0];
  let body: ReactNode;
  if (!target) {
    body = (
      <p className="dispatch-idle">
        {career.status === 'ready' ? "Type a waiting Station's name to start the Shift" : "Type a waiting Station's name"}
        {aim.mistyped && <span className="prompt-feedback" role="status">Wrong key</span>}
      </p>
    );
  } else {
    const state: TypingState = {
      target: target.text, cursor: aim.typed.length, keystrokes: 0, errors: 0, mistyped: aim.mistyped, done: false,
    };
    const typed = aim.typed.toLowerCase();
    const exact = aimed.find((t) => t.text.toLowerCase() === typed);
    const longer = aimed.some((t) => t.text.length > typed.length);
    body = (
      <>
        <Prompt state={state} errorTick={career.errors} />
        {exact && longer && (
          <p className="dispatch-confirm" role="note"><kbd>Enter</kbd> to clear {exact.text}</p>
        )}
      </>
    );
  }
  return (
    <div className="dispatch-typing" data-testid="dispatch-typing" data-stalled={stalled ? 'true' : undefined}>
      {body}
      {stalled && (
        // Keyed on the stall, so each one restarts its countdown bar.
        <p key={aim.stallUntil} className="dispatch-stall" role="status"
          style={{ '--stall-ms': `${aim.stallUntil - career.gameMs}ms` } as CSSProperties}>
          Wait…
        </p>
      )}
    </div>
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

  // Tips: the seen list is read once; a tip is marked seen when it is shown.
  const seenTips = useRef(new Set(loadProfile().dispatchTipsSeen ?? []));
  const [tips, setTips] = useState<DispatchTipId[]>([]);
  const tipsShowing = useRef(false);
  tipsShowing.current = tips.length > 0;
  const tipPaused = useRef(false);
  const markSeen = useCallback((ids: DispatchTipId[]) => {
    let profile = loadProfile();
    for (const id of ids) {
      seenTips.current.add(id);
      profile = markDispatchTipSeen(profile, id);
    }
    saveProfile(profile);
  }, []);
  const dismissTip = useCallback(() => setTips((queue) => queue.slice(1)), []);

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
    if (phoneLandscape || cur.status === 'ended') return;
    if (tipsShowing.current) return dismissTip();
    // Between Shifts the Expansion picker owns the keys.
    if (cur.status === 'between') return;
    if (cur.status === 'paused') {
      if (key === 'Enter' || key === ' ') act({ a: 'resume' });
      return;
    }
    if (key === 'Escape') return act({ a: 'pause' });
    if (key === 'Backspace') return act({ a: 'unlock' });
    if (key === 'Enter') return act({ a: 'confirm' });
    if (cur.status === 'ready' && !seenTips.current.has('start') && key.length === 1) markSeen(['start']);
    // A key landing after the Shift's last tick only ends it. Recorded, it would
    // sit past `endedAt` in the Keylog, and Replay refuses that.
    const now = runTick();
    const synced = advanceCareer(net, cur, now);
    if (synced.status === 'ended' || synced.status === 'between') return commit(synced);
    recorder.record(key, source, now);
    commit(enterDispatchCharacter(net, synced, key, now));
  }, [act, commit, dismissTip, markSeen, net, phoneLandscape, recorder]);

  // Between Shifts, unless a tip is showing, the Expansion picker owns the keys.
  const screenKeys = !phoneLandscape && run.status !== 'ended' && (run.status !== 'between' || tips.length > 0);
  useGameInput(onKey, screenKeys);

  // While the screen owns the keys, Enter and Space are game keys: a focused
  // button (End Career above all) must never take one as a click. Only
  // buttons are shielded: on a phone the characters arrive through the hidden
  // typing input, and cancelling its Space would make two-word names
  // untypeable. The picker's offer buttons keep their keys, so keyboard
  // focus can still choose one.
  const shielded = screenKeys;
  useEffect(() => {
    if (!shielded) return;
    const shield = (e: KeyboardEvent) => {
      const onButton = e.target instanceof Element && e.target.closest('button') !== null;
      if (onButton && (e.key === 'Enter' || e.key === ' ')) e.preventDefault();
    };
    window.addEventListener('keydown', shield);
    return () => window.removeEventListener('keydown', shield);
  }, [shielded]);

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
    if (cleared || fixed) sound.arrive();
    if (run.sim.nextIncidentId > prev.sim.nextIncidentId) sound.warning();
  }, [run, net]);

  // Music while the Shift runs, tense while anything is wrong; the setup
  // theme while choosing an Expansion.
  const track = run.status === 'between' ? 'rushSetup'
    : run.status !== 'running' ? null : dispatchTense(run) ? 'rushTense' : 'rushCalm';
  useEffect(() => {
    if (track) music.play(track);
    else music.stop();
  }, [track]);
  useEffect(() => () => music.stop(), []);

  // Tips freeze the Career with the ordinary pause action, so Replay sees
  // nothing unusual.
  const tipPrev = useRef(run);
  useEffect(() => {
    const prev = tipPrev.current;
    tipPrev.current = run;
    if (prev === run || run.status === 'ended' || run.status === 'ready') return;
    const fresh = newDispatchTips(net, prev, run, seenTips.current);
    if (fresh.length === 0) return;
    markSeen(fresh);
    setTips((queue) => [...queue, ...fresh]);
    if (currentRun.current.status === 'running') {
      tipPaused.current = true;
      act({ a: 'pause' });
    }
  }, [run, act, markSeen, net]);

  useEffect(() => {
    if (tips.length > 0 || !tipPaused.current) return;
    tipPaused.current = false;
    if (currentRun.current.status === 'paused') act({ a: 'resume' });
  }, [tips, act]);

  // Judged once, at the end. Only a failed Career can be eligible; an
  // abandoned one never reaches the judge. Replaying a long Career takes
  // seconds, so the judge waits for the summary to paint first: a frame, then
  // a task. `judged` is set only when it runs, so a cancelled wait (an effect
  // re-run) schedules it again rather than losing it.
  const [judgement, setJudgement] = useState<DispatchJudgement | null>(null);
  const judged = useRef(false);
  useEffect(() => {
    if (run.status !== 'ended' || run.endReason !== 'failed' || run.endedAt === null || judged.current) return;
    const endedAt = run.endedAt;
    let timer = 0;
    const frame = requestAnimationFrame(() => {
      timer = window.setTimeout(() => {
        if (judged.current) return;
        judged.current = true;
        const result = judgeCareer(net, {
          v: DISPATCH_EVIDENCE_VERSION,
          seed,
          keylog: recorder.snapshot(),
          actions: actions.current,
          endedAt,
        });
        if (!result.eligible) {
          saveProfile(recordIntegrityFail(loadProfile(), {
            t: Date.now(),
            mode: 'dispatch',
            reason: result.verdict && !result.verdict.ok ? result.verdict.reason : 'malformed-log',
          }));
        }
        setJudgement(result);
      }, 0);
    });
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [run, net, recorder, seed]);

  const key = servedKey(run.served);
  const served = useMemo(() => new Set(servedStations(net, run.served)), [net, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const lines = useMemo(() => new Set(servedLines(run.served)), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  // Between Shifts the offers join the frame, so each is on screen to choose.
  // Padding is a share of the frame, not the screen: the taller picker panel
  // needs much more of it at the bottom.
  const offers = run.status === 'between' ? run.offers : null;
  const offered = useMemo(() => offers?.flatMap((offer) => net.lines.get(offer.line)!.stations
    .slice(offer.from, offer.to + 1)) ?? [], [net, offers]);
  const labelled = useMemo(
    () => (offers ? new Set([...served, ...offers.map((offer) => offer.farEnd)]) : served),
    [served, offers],
  );
  const frame = useMemo(
    () => [...served, ...offered].map((id) => layout.get(id)).filter((p): p is Point => p !== undefined),
    [served, offered, layout],
  );
  const frameKey = offers ? `dispatch:${key}:offers` : `dispatch:${key}`;

  if (phoneLandscape && run.status !== 'ended') return <PhoneLandscapeBlock fullScreen />;
  if (run.status === 'ended') {
    return (
      <DispatchSummary
        net={net}
        career={run}
        metrics={careerMetrics(run, 0)}
        judgement={judgement}
        onAgain={onAgain}
        onBack={onExit}
      />
    );
  }

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
            labelled={labelled}
            activeStation={null}
            backdrop={backdrop}
            districts={districts}
            emphasisSet={lines}
            fitTo={frame}
            fitKey={frameKey}
            fitPadding={{ top: 0.12, right: 0.24, bottom: offers ? 0.7 : 0.3, left: 0.06 }}
            overlay={({ layout: l, markScale }) => (
              <DispatchOverlay net={net} layout={l} markScale={markScale} career={run} targets={targets} aimed={aimed} />
            )}
          />
        }
        panel={
          <>
            {run.status === 'between' ? (
              <>
                <DispatchExpansion
                  key={run.shift}
                  net={net}
                  career={run}
                  onPick={(pick) => act({ a: 'expand', pick })}
                  active={tips.length === 0}
                />
                <ConfirmEndButton onConfirm={() => act({ a: 'abandon' })} />
              </>
            ) : (
              <>
                {run.status === 'ready' && !seenTips.current.has('start') && (
                  <p className="dispatch-tip-inline" role="note">{dispatchTipText('start')}</p>
                )}
                <TypingLine career={run} aimed={aimed} />
                <p className="hint">
                  <kbd>Backspace</kbd> to let go · <kbd>Esc</kbd> to pause
                </p>
                <ConfirmEndButton onConfirm={() => act({ a: 'abandon' })} disabled={run.startedAt === null} />
              </>
            )}
            {tips.length > 0 ? (
              <TipCard key={tips[0]} id={tips[0]!} onDismiss={dismissTip} />
            ) : (
              run.status === 'paused' && <PauseOverlay onResume={() => act({ a: 'resume' })} />
            )}
          </>
        }
      />
      <ShiftBar career={run} />
      <aside className="dispatch-side" aria-label="Incidents panel">
        <DispatchIncidents net={net} career={run} />
      </aside>
    </div>
  );
}
