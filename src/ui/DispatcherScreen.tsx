import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject,
} from 'react';
import { music, sound } from '../audio/sound';
import type { LineCode, Point } from '../data/types';
import type { KeySource } from '../engine/keylog';
import type { NetworkIndex } from '../engine/network';
import {
  loadProfile, markDispatchTipSeen, recordIntegrityFail, resetDispatchTips, saveProfile,
} from '../engine/progress';
import {
  DISPATCH_EVIDENCE_VERSION,
  SHIFT_MS,
  advanceCareer,
  applyDispatchAction,
  careerMetrics,
  careerTotals,
  dispatchTense,
  enterDispatchCharacter,
  shiftFailCount,
  shiftPhase,
  startCareer,
  type CareerState,
  type DispatchAction,
  type DispatchActionBody,
} from '../engine/dispatch';
import { DISPATCH_KEYLOG_MAX_EVENTS } from '../engine/dispatchBalance';
import { LESSON_SEEN, lessonStations } from '../engine/dispatchLesson';
import { judgeCareer, type DispatchJudgement } from '../engine/dispatchJudge';
import { servedKey, servedLines, servedStations } from '../engine/dispatchNetwork';
import type { Incident } from '../engine/dispatchSim';
import { candidates, sameRef, visibleTargets, type Target } from '../engine/dispatchTargets';
import type { TypingState } from '../engine/typing';
import { networkLayout } from '../geo/networkLayout';
import { DispatchOverlay } from '../render/DispatchOverlay';
import {
  DISPATCH_FIT_PADDING, DISPATCH_LANE_PX, DISPATCH_MIN_MARK_PX, dispatchLabelled, overlayFrame, overlayObstacles,
  type ScreenRect,
} from '../render/dispatchLayout';
import { MapCanvas } from '../render/MapCanvas';
import { Prompt } from '../render/Prompt';
import { CLOSING_CARD_MS, CLOSURE_STAMP_MS, freshClosings, useClosures } from '../render/useClosures';
import { usePassengerMoments } from '../render/usePassengerMoments';
import { clearedSignals, liveMarks, useFreshWave, waveNoteDelays } from '../render/useSignalMarks';
import { prefersReducedMotion } from '../render/useLayoutMode';
import { ClosureGauge, closureBand } from './ClosureGauge';
import { ConfirmEndButton } from './ConfirmEndButton';
import { DispatchExpansion } from './DispatchExpansion';
import { DispatchIncidents } from './DispatchIncidents';
import { DispatchSummary } from './DispatchSummary';
import {
  dispatchTipText, newDispatchTips, tipSubject, type DispatchTipId, type TipSubject,
} from './dispatchTips';
import { PhoneLandscapeBlock } from './PhoneLandscapeBlock';
import { PlayLayout } from './PlayLayout';
import { useGameInput } from './TypingInputProvider';
import { lessonCaption, useDispatchLesson } from './useDispatchLesson';
import { useFailHold } from './useFailHold';
import { runTick, useRunRecorder } from './useRunRecorder';
import './dispatch.css';

export interface DispatcherScreenProps {
  net: NetworkIndex;
  onExit: () => void;
  onAgain: () => void;
  phoneLandscape?: boolean;
  /** Test-only: start from this state instead of startCareer. */
  initial?: CareerState;
  /** Test-only: fix the new Career's seed, still showing the lesson as a first-time player sees it. */
  lessonFor?: { seed: number };
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

// What End Career means for the leaderboard: only a Career ended between Shifts is ranked.
const RANKED_NOTE = 'Your Career will be ranked.';
const UNRANKED_NOTE = "Mid-Shift, it won't be ranked. Clear the Shift to keep your score.";

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

/** How much an Expansion grew the network: Lines and Stations added. */
interface Growth { lines: number; stations: number }

/** A count, with what the last Expansion added beside it. */
function Grown({ by }: { by: number }) {
  return by > 0 ? <span className="dispatch-grown" aria-label={`${by} new`}>+{by}</span> : null;
}

/** Shift number, phase and peak direction, time left, the network's size, Delivered and on-time %. */
function ShiftBar({ career, lines, stations, grown, closed, slots, fresh }: {
  career: CareerState; lines: number; stations: number; grown: Growth | null;
  closed: number; slots: number; fresh: boolean;
}) {
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
      <ClosureGauge closed={closed} slots={slots} fresh={fresh} />
      <dl className="dispatch-stats">
        <dt>Lines</dt>
        <dd>{lines}<Grown by={grown?.lines ?? 0} /></dd>
        <dt>Stations</dt>
        <dd>{stations}<Grown by={grown?.stations ?? 0} /></dd>
        <dt>Delivered</dt>
        <dd>{totals.delivered}</dd>
        <dt>On time</dt>
        <dd>{Math.round(totals.onTimePct)}%</dd>
      </dl>
    </header>
  );
}

/**
 * The frame while a fix is typed: a lean towards the Incident, never a
 * close-up. It holds the place and its Served neighbours on its Line, so the
 * shot never closes in on one dot, and every waiting train's Station, so no
 * train waits out of view. The key carries the waiting Stations: one that
 * starts waiting mid-fix moves the key, and the map refits to take it in.
 */
function leanIn(
  net: NetworkIndex, sim: CareerState['sim'], incident: Incident, targets: readonly Target[],
  served: ReadonlySet<string>,
): { stations: string[]; key: string } {
  const near = withNeighbours(net, incident.line, incident.place, served);
  const waiting = new Set<string>();
  for (const target of targets) {
    if (target.ref.kind === 'fix') continue;
    const id = target.ref.train;
    const train = sim.trains.find((t) => t.id === id);
    const station = train && net.lines.get(train.line)!.stations[train.at];
    if (station) waiting.add(station);
  }
  return {
    stations: [...new Set([...near, ...waiting])],
    key: `fix:${incident.id}:${[...waiting].sort().join(',')}`,
  };
}

/** A Station and its Served neighbours on `line`: a frame that never closes in on one dot. */
function withNeighbours(net: NetworkIndex, line: LineCode, station: string, served: ReadonlySet<string>): string[] {
  const ids = net.lines.get(line)!.stations;
  const at = ids.indexOf(station);
  if (at < 0) return [station];
  return [ids[at - 1], station, ids[at + 1]]
    .filter((id): id is string => id !== undefined && (id === station || served.has(id)));
}

/**
 * The Stations a tip about trains frames, with the lean-in's framing: those it
 * is about and each of its trains' own, each with its Served neighbours on the
 * trains' Line.
 */
function subjectStations(
  net: NetworkIndex, sim: CareerState['sim'], subject: TipSubject, served: ReadonlySet<string>,
): string[] {
  const trains = subject.trains.flatMap((id) => sim.trains.filter((t) => t.id === id));
  const at = trains.map((train) => net.lines.get(train.line)!.stations[train.at]!);
  const lines = [...new Set(trains.map((train) => train.line))];
  return [...new Set([...subject.stations, ...at].flatMap((station) => lines.length === 0 ? [station]
    : lines.flatMap((line) => withNeighbours(net, line, station, served))))];
}

/** The panels floating over the Dispatcher's map: the top bar, the Incidents panel and the typing panel. */
const PANELS = ['.dispatch-bar', '.dispatch-side', '.play-panel'] as const;

const sameRects = (a: readonly ScreenRect[], b: readonly ScreenRect[]) => a.length === b.length
  && a.every((r, i) => ['x', 'y', 'w', 'h'].every((k) =>
    Math.abs(r[k as keyof ScreenRect] - b[i]![k as keyof ScreenRect]) < 0.5));

/**
 * Where the panels over the map are, in screen pixels from the map's corner,
 * so chips can keep out from under them. Measured after every render, before
 * paint, so a panel that just grew (the Incidents panel grows with every
 * card) never shows a chip under it even for a frame; and again whenever a
 * panel or the window changes size by itself.
 */
function usePanelRects(root: RefObject<HTMLElement | null>, live: boolean): ScreenRect[] {
  const [rects, setRects] = useState<ScreenRect[]>([]);
  const remeasure = useRef<(() => void) | null>(null);
  useLayoutEffect(() => remeasure.current?.());
  useLayoutEffect(() => {
    const el = root.current;
    if (!live || !el) return;
    const measure = () => {
      const map = el.querySelector('.map-canvas')?.getBoundingClientRect();
      if (!map || map.width <= 0 || map.height <= 0) return;
      const next = PANELS.flatMap((selector) => {
        const r = el.querySelector(selector)?.getBoundingClientRect();
        // A panel as wide as the map is no floating panel: nothing is laid out yet.
        if (!r || r.width <= 0 || r.height <= 0 || r.width >= map.width) return [];
        return [{ x: r.left - map.left, y: r.top - map.top, w: r.width, h: r.height }];
      });
      setRects((prev) => (sameRects(prev, next) ? prev : next));
    };
    measure();
    remeasure.current = measure;
    window.addEventListener('resize', measure);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    for (const selector of PANELS) {
      const panel = el.querySelector(selector);
      if (panel) observer?.observe(panel);
    }
    return () => {
      remeasure.current = null;
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, [root, live]);
  return rects;
}

/** How long the streak count flashes when a Green wave fires. */
const WAVE_FLASH_MS = 1_200;

/**
 * The typing line: the aimed text with the usual typed/current/pending
 * treatment. While a wrong key's stall runs, keys are dropped, so the line
 * says so: it dims and shows "Wait…" until the Shift clock passes the stall.
 * Beside it, the streak count builds towards a Green wave and flashes when one
 * fires. `waiting: false` (the lesson's train on the move) drops the idle prompt.
 */
function TypingLine({ career, aimed, showStreak = true, waiting = true }: {
  career: CareerState; aimed: readonly Target[]; showStreak?: boolean; waiting?: boolean;
}) {
  const { aim } = career;
  const wave = useFreshWave(career.lastWave, WAVE_FLASH_MS);
  const stalled = career.gameMs < aim.stallUntil;
  const target = aim.lock ? aimed.find((t) => sameRef(t.ref, aim.lock!)) : aimed[0];
  let body: ReactNode;
  if (!target) {
    body = waiting && (
      <p className="dispatch-idle">
        {career.status === 'ready' ? "Type a waiting Station's name to start the Shift" : "Type a waiting Station's name"}
        {aim.misses > 0 && <span className="prompt-feedback" role="status">Wrong key</span>}
      </p>
    );
  } else {
    const state: TypingState = {
      target: target.text, cursor: aim.typed.length, keystrokes: 0, errors: 0, mistyped: aim.misses > 0, done: false,
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
      <div className="dispatch-typing-row">
        <div className="dispatch-typing-body">{body}</div>
        {/* Keyed on the wave, so each one restarts the flash. */}
        {showStreak && (
          <p key={wave?.id ?? 0} className="dispatch-streak" data-testid="streak"
            data-wave={wave ? 'true' : undefined}>
            Streak {career.streak}
          </p>
        )}
      </div>
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

export function DispatcherScreen({
  net, onExit, onAgain, phoneLandscape = false, initial, lessonFor,
}: DispatcherScreenProps) {
  const { geo: layout, backdrop, districts } = useMemo(() => networkLayout(), []);
  const [seed] = useState(() => initial?.seed ?? lessonFor?.seed ?? Math.floor(Math.random() * 2 ** 32));
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

  // The guided first Shift, until it has been finished or skipped once. A
  // Career passed in (the dev full-network Career) goes straight to the Shift.
  // Finished or skipped, it hands over to the start caption, even for a player
  // who saw that caption in an earlier Career; the Career's first key marks it seen again.
  const {
    lesson, start: startLesson, skip: skipLesson, leave: leaveLesson, onKey: lessonOnKey,
  } = useDispatchLesson(net, initial === undefined && !seenTips.current.has(LESSON_SEEN),
    () => seenTips.current.delete('start'));
  const inLesson = useRef(false);
  inLesson.current = lesson !== null;
  // How to play: forget every tip, the lesson's seen flag with them, and run the lesson again.
  const replayLesson = useCallback(() => {
    saveProfile(resetDispatchTips(loadProfile()));
    seenTips.current.clear();
    startLesson();
  }, [startLesson]);

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
    // The lesson's keys are its own: none reaches the Career or the Keylog.
    if (inLesson.current) return lessonOnKey(key);
    // Between Shifts the Expansion picker owns the keys.
    if (cur.status === 'between') return;
    if (cur.status === 'paused') {
      if (key === 'Enter' || key === ' ') act({ a: 'resume' });
      return;
    }
    // Before the first key nothing is recorded, so leaving needs no confirm.
    if (key === 'Escape') return cur.startedAt === null ? onExit() : act({ a: 'pause' });
    if (key === 'Backspace') return act({ a: 'backspace' });
    if (key === 'Enter') return act({ a: 'confirm' });
    if (cur.status === 'ready' && !seenTips.current.has('start') && key.length === 1) markSeen(['start']);
    // A key landing after the Shift's last tick only ends it. Recorded, it would
    // sit past `endedAt` in the Keylog, and Replay refuses that.
    const now = runTick();
    const synced = advanceCareer(net, cur, now);
    if (synced.status === 'ended' || synced.status === 'between') return commit(synced);
    recorder.record(key, source, now);
    commit(enterDispatchCharacter(net, synced, key, now));
  }, [act, commit, dismissTip, lessonOnKey, markSeen, net, onExit, phoneLandscape, recorder]);

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
    const cleared = clearedSignals(net, prev.sim, run.sim).length > 0;
    const fixed = prev.sim.incidents.some((inc) => {
      const now = run.sim.incidents.find((i) => i.id === inc.id);
      return now ? now.step > inc.step : !run.sim.outOfService[inc.place];
    });
    if (cleared || fixed) sound.arrive();
    if (run.waves > prev.waves && run.lastWave) {
      sound.wave(waveNoteDelays(run.lastWave.cleared.length, prefersReducedMotion()));
    }
    if (run.sim.nextIncidentId > prev.sim.nextIncidentId) sound.warning();
    if (run.sim.oosOrder.length > prev.sim.oosOrder.length) {
      sound.closure(closureBand(run.sim.oosOrder.length, shiftFailCount(net, run.served)) === 'danger');
    }
  }, [run, net]);

  // While the lesson shows, the map, the overlay and the typing line draw its
  // throwaway state; the Shift bar, the Incidents panel and the passenger pops
  // keep the Career (the lesson carries no one, so it would only pop "+0").
  const shown = lesson?.career ?? run;

  // The Delivered chime only ever sounds with a pop that shows someone home.
  const moments = usePassengerMoments(net, run);
  const chimed = useRef(new Set<string>());
  useEffect(() => {
    const fresh = moments.pops.some((pop) => !chimed.current.has(pop.key) && pop.delivered > 0);
    chimed.current = new Set(moments.pops.map((pop) => pop.key));
    if (fresh) sound.delivered();
  }, [moments.pops]);

  // Music while the Shift runs, tense while an Incident is active; the setup
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

  // Judged once, at the end. Only a failed or retired Career can be eligible;
  // one abandoned mid-Shift never reaches the judge. Replaying a long Career takes
  // seconds, so the judge waits for the summary to paint first: a frame, then
  // a task. `judged` is set only when it runs, so a cancelled wait (an effect
  // re-run) schedules it again rather than losing it.
  const [judgement, setJudgement] = useState<DispatchJudgement | null>(null);
  // A failed Shift holds the map for a moment first; the judge waits for the
  // hold, so replaying never janks it.
  const failHold = useFailHold(run);
  const judged = useRef(false);
  useEffect(() => {
    if (run.status !== 'ended' || run.endReason === 'abandoned' || run.endedAt === null || judged.current) return;
    if (failHold) return;
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
  }, [run, failHold, net, recorder, seed]);

  const key = servedKey(run.served);
  const served = useMemo(() => new Set(servedStations(net, run.served)), [net, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const lines = useMemo(() => new Set(servedLines(run.served)), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  // The Career's own closings, never the lesson's throwaway one.
  const closings = useClosures(run);
  // The network as the last Shift ended, so the next one can show what its
  // Expansion added until its first key.
  const [before, setBefore] = useState<Growth | null>(null);
  useEffect(() => {
    if (run.status === 'between') setBefore({ lines: lines.size, stations: served.size });
  }, [run.status, lines, served]);
  const grown = run.status === 'ready' && before
    ? { lines: lines.size - before.lines, stations: served.size - before.stations } : null;
  // Between Shifts the offers join the frame, so each is on screen to choose.
  // Padding is a share of the frame, not the screen: the taller picker panel
  // needs much more of it at the bottom.
  const offers = run.status === 'between' ? run.offers : null;
  const offered = useMemo(() => offers?.flatMap((offer) => net.lines.get(offer.line)!.stations
    .slice(offer.from, offer.to + 1)) ?? [], [net, offers]);
  const frame = useMemo(
    () => [...served, ...offered].map((id) => layout.get(id)).filter((p): p is Point => p !== undefined),
    [served, offered, layout],
  );
  const frameKey = offers ? `dispatch:${key}:offers` : `dispatch:${key}`;
  const lessonServedKey = lesson ? servedKey(lesson.career.served) : null;
  const lessonServed = useMemo(() => (lesson ? new Set(servedStations(net, lesson.career.served)) : null),
    [net, lessonServedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const lessonLines = useMemo(() => (lesson ? new Set(servedLines(lesson.career.served)) : null),
    [lessonServedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const lessonFrame = useMemo(() => lessonStations(net).map((id) => layout.get(id))
    .filter((p): p is Point => p !== undefined), [net, layout]);
  const rootRef = useRef<HTMLDivElement>(null);
  const showingPlay = run.status !== 'ended' || failHold;
  const panels = usePanelRects(rootRef, !phoneLandscape && showingPlay);

  if (phoneLandscape && showingPlay) return <PhoneLandscapeBlock fullScreen />;
  if (!showingPlay) {
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

  const targets = visibleTargets(net, shown.sim);
  const aimed = shown.aim.typed !== '' || shown.aim.lock ? candidates(targets, shown.aim) : [];
  const lock = shown.aim.lock;
  const lockedTrain = lock && lock.kind !== 'fix' ? shown.sim.trains.find((t) => t.id === lock.train) : undefined;
  const lineColour = lockedTrain ? net.lines.get(lockedTrain.line)?.colour ?? null : null;
  // A completed fix can leave the lock behind for a moment; only a fix that is
  // still there to type counts.
  const fixing = lock?.kind === 'fix' && targets.some((t) => sameRef(t.ref, lock))
    ? shown.sim.incidents.find((inc) => inc.id === lock.incident) : undefined;
  // Reduced motion keeps the camera still; the edge and the glow still show.
  const lean = fixing && !prefersReducedMotion() ? leanIn(net, shown.sim, fixing, targets, served) : null;
  const visited = lessonServed ?? served;
  const labelled = dispatchLabelled(net, shown, visited, targets);
  const leanFrame = lean?.stations.map((id) => layout.get(id)).filter((p): p is Point => p !== undefined);
  // A tip about trains points at them while it pauses the Career: the camera
  // leans in on them and the Stations they are about, and they pulse. Reduced
  // motion keeps the camera still; the pulse becomes a steady ring. Its frame
  // wins over a typed fix's lean-in.
  const subject = tips[0] && !lesson ? tipSubject(net, run, tips[0]) : null;
  const spotlight = subject ? new Set(subject.trains) : undefined;
  const tipFrame = subject && !prefersReducedMotion()
    ? subjectStations(net, run.sim, subject, served).map((id) => layout.get(id)).filter((p): p is Point => p !== undefined)
    : null;

  // The urgent edge holds off behind the Pause and Tip dialogs.
  const urgent = fixing && run.status === 'running' && tips.length === 0;
  // Closure animations stand still with the Shift. A tip's pause lands a render late.
  const paused = run.status === 'paused' || tips.length > 0;
  const freshNow = freshClosings(closings, run.sim.shiftMs, CLOSURE_STAMP_MS);
  // The lesson's map is its own throwaway Shift: none of the Career's stamps show on it.
  const stamping = lesson ? undefined : new Set(freshNow.map((c) => c.station));

  return (
    <div className="dispatcher" ref={rootRef} data-urgent={urgent ? 'true' : undefined}
      data-paused={paused ? 'true' : undefined}>
      <PlayLayout
        lineColour={lineColour}
        map={
          <MapCanvas
            net={net}
            layout={layout}
            visited={visited}
            labelled={labelled}
            minMarkPx={DISPATCH_MIN_MARK_PX}
            laneOffsetPx={DISPATCH_LANE_PX}
            labelAvoid={(markScale, { view, screen }) => overlayObstacles(net, layout, shown, targets,
              liveMarks(net, shown, targets), markScale, overlayFrame(view, screen, panels))}
            activeStation={null}
            backdrop={backdrop}
            districts={districts}
            emphasisSet={lessonLines ?? lines}
            fitTo={lesson ? lessonFrame : tipFrame ?? leanFrame ?? frame}
            fitKey={lesson ? 'dispatch:lesson' : tipFrame ? `tip:${tips[0]}` : lean?.key ?? frameKey}
            fitPadding={offers ? { ...DISPATCH_FIT_PADDING, bottom: 0.7 } : DISPATCH_FIT_PADDING}
            overlay={({ layout: l, markScale, view, screen, tracks }) => (
              <DispatchOverlay net={net} layout={l} markScale={markScale} career={shown} targets={targets} aimed={aimed}
                moments={moments} frame={overlayFrame(view, screen, panels)} tracks={tracks} stamping={stamping}
                spotlight={spotlight} />
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
                <ConfirmEndButton onConfirm={() => act({ a: 'abandon' })} note={RANKED_NOTE} />
              </>
            ) : lesson ? (
              <>
                {lessonCaption(lesson.step) && (
                  <p className="dispatch-tip-inline" role="note">{lessonCaption(lesson.step)}</p>
                )}
                <TypingLine career={lesson.career} aimed={aimed} showStreak={false}
                  waiting={lesson.step === 'first' || lesson.step === 'second'} />
                <button type="button" className="dispatch-end" onClick={skipLesson}>
                  <kbd>Esc</kbd> Skip
                </button>
                <button type="button" className="dispatch-end" onClick={() => {
                  leaveLesson();
                  onExit();
                }}>
                  Back to map
                </button>
              </>
            ) : (
              <>
                {run.status === 'ready' && !seenTips.current.has('start') && (
                  <p className="dispatch-tip-inline" role="note">{dispatchTipText('start')}</p>
                )}
                <TypingLine career={run} aimed={aimed} />
                {failHold ? null : run.startedAt === null ? (
                  <>
                    <button type="button" className="dispatch-end" onClick={onExit}>
                      <kbd>Esc</kbd> Back to map
                    </button>
                    <button type="button" className="dispatch-end" onClick={replayLesson}>
                      How to play
                    </button>
                  </>
                ) : (
                  <>
                    <p className="hint">
                      <kbd>Backspace</kbd> to undo · <kbd>Esc</kbd> to pause
                    </p>
                    <ConfirmEndButton onConfirm={() => act({ a: 'abandon' })}
                      note={run.status === 'ready' ? RANKED_NOTE : UNRANKED_NOTE} />
                  </>
                )}
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
      <ShiftBar career={run} lines={lines.size} stations={served.size} grown={grown}
        closed={run.sim.oosOrder.length} slots={shiftFailCount(net, run.served)}
        fresh={freshNow.length > 0} />
      <aside className="dispatch-side" aria-label="Incidents panel">
        <DispatchIncidents net={net} career={run}
          closing={freshClosings(closings, run.sim.shiftMs, CLOSING_CARD_MS).filter((c) => c.incident !== null)} />
      </aside>
    </div>
  );
}
