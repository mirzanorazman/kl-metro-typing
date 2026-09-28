import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { sound } from '../audio/sound';
import type { LineCode, Point } from '../data/types';
import { lineAt, stationAt, type Direction, type NetworkIndex } from '../engine/network';
import { loadProfile, markRushTipSeen, recordIntegrityFail, recordRushBest, saveProfile } from '../engine/progress';
import type { KeySource } from '../engine/keylog';
import { CARRIAGE_CAPACITY, OVERFLOW_MS, RUSH_KEYLOG_MAX_EVENTS } from '../engine/rushBalance';
import {
  RUSH_EVIDENCE_VERSION,
  advanceRush,
  applyRushAction,
  enterRushCharacter,
  rushDayPhase,
  rushLineSetKey,
  rushMetrics,
  startRush,
  type RushAction,
  type RushActionBody,
  type RushState,
} from '../engine/rushHour';
import { judgeRushRun } from '../engine/rushJudge';
import { networkLayout } from '../geo/networkLayout';
import { MapCanvas } from '../render/MapCanvas';
import { Prompt } from '../render/Prompt';
import { RushQueues } from '../render/RushQueues';
import { LineBadge } from './LineBadge';
import { PhoneLandscapeBlock } from './PhoneLandscapeBlock';
import { PlayLayout } from './PlayLayout';
import { RushJunction } from './RushJunction';
import { newRushTips, rushTipText, type RushTipId } from './rushTips';
import { RushSummary } from './RushSummary';
import { useGameInput } from './TypingInputProvider';
import { useKeyboard } from './useKeyboard';
import { runTick, useRunRecorder } from './useRunRecorder';
import './rush.css';

export interface RushHourScreenProps {
  net: NetworkIndex;
  lineSet: LineCode[];
  startAt: string;
  onExit: () => void;
  onAgain: () => void;
  phoneLandscape?: boolean;
}

function PauseOverlay({ onResume }: { onResume: () => void }) {
  const onKey = useCallback((key: string) => {
    if (key === 'Enter' || key === ' ') onResume();
  }, [onResume]);
  useKeyboard(onKey);
  return (
    <div className="rush-paused" role="dialog" aria-label="Paused">
      <h2>Paused</h2>
      <p>The trains wait for you.</p>
      <button type="button" onClick={onResume}>
        <kbd>Enter</kbd> Resume
      </button>
    </div>
  );
}

/** A one-time tip. The Run is paused while it shows; any key or click dismisses it. */
function TipCard({ id, onDismiss }: { id: RushTipId; onDismiss: () => void }) {
  return (
    <div className="rush-paused rush-tip" role="dialog" aria-label="Tip">
      <p>{rushTipText(id)}</p>
      <button type="button" onClick={onDismiss}>
        <kbd>any key</kbd> Got it
      </button>
    </div>
  );
}

/** Stations up to `reach` stops either side of `at` on `line`, for framing. */
function nearby(net: NetworkIndex, line: LineCode | null, at: string, reach: number): string[] {
  if (!line) return [];
  const stations = net.lines.get(line)?.stations ?? [];
  const i = stations.indexOf(at);
  return i < 0 ? [] : stations.slice(Math.max(0, i - reach), i + reach + 1);
}

export function RushHourScreen({
  net, lineSet, startAt, onExit, onAgain, phoneLandscape = false,
}: RushHourScreenProps) {
  const { geo: layout, backdrop, districts } = useMemo(() => networkLayout(), []);
  const [seed] = useState(() => Math.floor(Math.random() * 2 ** 32));
  const [run, setRun] = useState<RushState>(() => startRush(net, lineSet, startAt, seed));
  const currentRun = useRef(run);
  const [openedAt] = useState(runTick);
  const recorder = useRunRecorder(openedAt, RUSH_KEYLOG_MAX_EVENTS);
  const actions = useRef<RushAction[]>([]);

  // Tips: the seen list is read once; a tip is marked seen when it is shown.
  const seenTips = useRef(new Set(loadProfile().rushTipsSeen ?? []));
  const [tips, setTips] = useState<RushTipId[]>([]);
  const tipsShowing = useRef(false);
  tipsShowing.current = tips.length > 0;
  const tipPaused = useRef(false);
  const markSeen = useCallback((ids: RushTipId[]) => {
    let profile = loadProfile();
    for (const id of ids) {
      seenTips.current.add(id);
      profile = markRushTipSeen(profile, id);
    }
    saveProfile(profile);
  }, []);
  const dismissTip = useCallback(() => setTips((queue) => queue.slice(1)), []);

  // Events advance the ref synchronously, and React only ever receives
  // values, so a re-run updater can never apply an input twice.
  const commit = useCallback((next: RushState) => {
    if (next === currentRun.current) return;
    currentRun.current = next;
    setRun(next);
  }, []);

  /** Applies a non-key action, logging it only if the engine took it. */
  const act = useCallback((body: RushActionBody) => {
    const prev = currentRun.current;
    const now = runTick();
    const next = applyRushAction(net, prev, body, now);
    if (next === prev) return;
    actions.current.push({ ...body, i: recorder.snapshot().events.length, t: now } as RushAction);
    commit(next);
  }, [commit, net, recorder]);

  const onKey = useCallback((key: string, source?: KeySource) => {
    const cur = currentRun.current;
    if (phoneLandscape || cur.status === 'ended') return;
    if (tipsShowing.current) return dismissTip();
    if (cur.status === 'ready' && !seenTips.current.has('start') && key.length === 1) markSeen(['start']);
    if (key === 'Escape') return act({ a: 'pause' });
    if (cur.status === 'paused') return;
    if (key === 'Backspace') return act({ a: 'turn' });
    // At a Junction the picker owns the keys; while walking nothing is typed.
    if (cur.stage !== 'typing') return;
    const now = recorder.record(key, source);
    commit(enterRushCharacter(net, currentRun.current, key, now));
  }, [act, commit, dismissTip, markSeen, net, phoneLandscape, recorder]);

  useGameInput(onKey, !phoneLandscape && run.status !== 'ended');

  // The sim advances once per frame; `commit` ignores frames with no new tick.
  useEffect(() => {
    if (run.status !== 'running') return;
    let frame = 0;
    const loop = () => {
      commit(advanceRush(net, currentRun.current, runTick()));
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [commit, net, run.status]);

  // Losing a Run to an incoming call is infuriating and entirely avoidable.
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
  const heard = useRef({ chars: 0, errors: 0, visited: 0, delivered: 0, warned: new Set<string>() });
  useEffect(() => {
    const h = heard.current;
    if (run.errors > h.errors) sound.error();
    else if (run.correctChars > h.chars) sound.key();
    if (run.delivered > h.delivered) sound.delivered();
    else if (run.visited.length > h.visited) sound.arrive();
    for (const [id, q] of Object.entries(run.queues)) {
      const critical = q.overflowMs >= OVERFLOW_MS / 2;
      if (critical && !h.warned.has(id)) {
        h.warned.add(id);
        sound.warning();
      } else if (!critical) {
        h.warned.delete(id);
      }
    }
    h.chars = run.correctChars;
    h.errors = run.errors;
    h.visited = run.visited.length;
    h.delivered = run.delivered;
  }, [run]);

  // Tips freeze the Run with the ordinary pause action, so Replay and bests
  // see nothing unusual.
  const tipPrev = useRef(run);
  useEffect(() => {
    const prev = tipPrev.current;
    tipPrev.current = run;
    if (run.status === 'ended' || run.status === 'ready') return;
    const fresh = newRushTips(prev, run, seenTips.current);
    if (fresh.length === 0) return;
    markSeen(fresh);
    setTips((queue) => [...queue, ...fresh]);
    if (currentRun.current.status === 'running') {
      tipPaused.current = true;
      act({ a: 'pause' });
    }
  }, [run, act, markSeen]);

  useEffect(() => {
    if (tips.length > 0 || !tipPaused.current) return;
    tipPaused.current = false;
    if (currentRun.current.status === 'paused') act({ a: 'resume' });
  }, [tips, act]);

  // Judge once, at the end: only an Eligible Run may move the best.
  const lineSetKey = rushLineSetKey(run.lineSet);
  const [bestAfter, setBestAfter] = useState<number | null>(null);
  const [newBest, setNewBest] = useState(false);
  const judged = useRef(false);
  useEffect(() => {
    if (run.status !== 'ended' || judged.current) return;
    judged.current = true;
    let profile = loadProfile();
    profile = { ...profile, visited: [...new Set([...profile.visited, ...run.visited])] };
    const before = profile.rushHigh?.[lineSetKey] ?? 0;

    if (run.endReason === 'overflow' && run.endedAt !== null) {
      const judgement = judgeRushRun(net, {
        v: RUSH_EVIDENCE_VERSION,
        lineSet: run.lineSet,
        start: startAt,
        seed,
        keylog: recorder.snapshot(),
        actions: actions.current,
        endedAt: run.endedAt,
      });
      if (judgement.eligible) {
        profile = recordRushBest(profile, lineSetKey, judgement.delivered);
        setNewBest(judgement.delivered > before);
      } else {
        profile = recordIntegrityFail(profile, {
          t: Date.now(),
          mode: 'rush',
          reason: judgement.verdict && !judgement.verdict.ok ? judgement.verdict.reason : 'malformed-log',
        });
      }
    }
    saveProfile(profile);
    setBestAfter(profile.rushHigh?.[lineSetKey] ?? 0);
  }, [run, lineSetKey, net, recorder, seed, startAt]);

  const onChoose = useCallback((dir: Direction) => act({ a: 'choose', line: dir.line, next: dir.next }), [act]);
  const onWalk = useCallback((to: string) => act({ a: 'walk', to }), [act]);

  if (phoneLandscape && run.status !== 'ended') return <PhoneLandscapeBlock fullScreen />;

  const now = run.status === 'running' ? runTick() : 0;
  const metrics = rushMetrics(run, now);

  if (run.status === 'ended') {
    return (
      <RushSummary
        net={net}
        run={run}
        metrics={metrics}
        best={bestAfter}
        newBest={newBest}
        onAgain={onAgain}
        onBack={onExit}
      />
    );
  }

  const phase = rushDayPhase(run.gameMs);
  const line = run.line ? lineAt(net, run.line) : null;
  const lineSetCodes = new Set(run.lineSet);
  const highlight = new Set(run.options.map((o) => o.next));
  const frame = [run.arrivedFrom, run.at, ...highlight, ...nearby(net, run.line, run.at, 3)]
    .filter((id): id is string => !!id)
    .map((id) => layout.get(id))
    .filter((p): p is Point => p !== undefined);
  const loadByLine = new Map<LineCode, number>();
  for (const p of run.load) loadByLine.set(p.target, (loadByLine.get(p.target) ?? 0) + 1);

  return (
    <div className="rush-hour">
      <PlayLayout
        lineColour={line?.colour ?? null}
        map={
          <MapCanvas
            net={net}
            layout={layout}
            visited={new Set(run.visited)}
            activeStation={run.at}
            previousStation={run.arrivedFrom}
            highlight={highlight}
            backdrop={backdrop}
            districts={districts}
            emphasisSet={lineSetCodes}
            trainProgress={run.typing.target.length > 0 ? run.typing.cursor / run.typing.target.length : 0}
            trainErrorTick={run.errors}
            trainColour={line?.colour ?? null}
            focusTo={frame}
            focus={layout.get(run.at) ?? null}
            focusKey={run.at}
            fitPadding={{ top: 0.06, right: 0.06, bottom: 0.38, left: 0.06 }}
            overlay={({ layout: l, markScale }) => (
              <RushQueues net={net} layout={l} markScale={markScale} queues={run.queues} />
            )}
          />
        }
        panel={
          <>
            <div className="rush-day" aria-label="Time of day">
              <span>Day {phase.day} · {phase.name}</span>
              <span className="rush-day-bar" aria-hidden="true">
                <span style={{ width: `${Math.round(phase.progress * 100)}%` }} />
              </span>
            </div>
            <dl className="quick-run-metrics rush-metrics">
              <dt>Delivered</dt>
              <dd>{run.delivered}</dd>
              <dt>WPM</dt>
              <dd>{run.status === 'ready' ? '—' : Math.round(metrics.wpm)}</dd>
              <dt>Load</dt>
              <dd>{run.load.length}/{CARRIAGE_CAPACITY}</dd>
            </dl>
            <p className="rush-load" aria-label="Passengers aboard, by the line they want">
              {run.load.length === 0 ? (
                <span className="hint">Nobody aboard</span>
              ) : (
                [...loadByLine].map(([code, count]) => (
                  <span key={code} className="rush-load-item">
                    <LineBadge code={code} colour={net.lines.get(code)!.colour} /> ×{count}
                  </span>
                ))
              )}
            </p>

            {run.status === 'ready' && !seenTips.current.has('start') && (
              <p className="rush-tip-inline" role="note">{rushTipText('start')}</p>
            )}
            {run.stage === 'typing' && <Prompt state={run.typing} errorTick={run.errors} />}
            {run.stage === 'walking' && (
              <p className="rush-walking" role="status">
                Walking to {stationAt(net, run.at)?.name}…
              </p>
            )}
            {run.stage === 'junction' && run.status !== 'paused' && (
              <RushJunction net={net} run={run} onChoose={onChoose} onWalk={onWalk} />
            )}

            <p className="hint">
              {run.status === 'ready'
                ? 'Type the station name to start · '
                : run.arrivedFrom && run.stage === 'typing'
                  ? <><kbd>Backspace</kbd> to turn around · </>
                  : null}
              <kbd>Esc</kbd> to pause
            </p>
            <button type="button" onClick={() => act({ a: 'abandon' })} disabled={run.status === 'ready'}>
              End run
            </button>
            {tips.length > 0 ? (
              <TipCard id={tips[0]!} onDismiss={dismissTip} />
            ) : (
              run.status === 'paused' && <PauseOverlay onResume={() => act({ a: 'resume' })} />
            )}
          </>
        }
      />
    </div>
  );
}
