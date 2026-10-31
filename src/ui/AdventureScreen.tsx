import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { sound } from '../audio/sound';
import { networkLayout } from '../geo/networkLayout';
import {
  lineAt, stationAt, walkOptions, type Direction, type NetworkIndex,
} from '../engine/network';
import {
  chooseDirection, endRun, keyRun, runMetrics, startRun, turnAround, walkTo, type RunState,
} from '../engine/run';
import {
  loadProfile, recordStation, saveAdventurePosition, saveProfile, type Profile,
} from '../engine/progress';
import type { Point } from '../data/types';
import {
  recordAdventureArrival, recordJunctionChoice, recordWalk, startAdventure,
} from '../engine/achievementRuns';
import type { EarnedTier } from '../engine/achievementState';
import { MapCanvas } from '../render/MapCanvas';
import { Prompt } from '../render/Prompt';
import { HUD } from '../render/HUD';
import { LineStrip } from '../render/LineStrip';
import { useLayoutMode } from '../render/useLayoutMode';
import { PlayLayout } from './PlayLayout';
import { PhoneLandscapeBlock } from './PhoneLandscapeBlock';
import { JunctionPicker } from './JunctionPicker';
import { useGameInput, useTypingInputControls } from './TypingInputProvider';
import { usePhoneLayout } from './usePhoneLayout';
import { SummaryScreen } from './SummaryScreen';
import { updateAchievements } from './achievementsStore';

function MobileTurnAround({ onTurnAround }: { onTurnAround: () => void }) {
  const { focusInput } = useTypingInputControls();

  return (
    <button
      type="button"
      className="mobile-turn-around"
      onClick={() => {
        focusInput();
        onTurnAround();
      }}
    >
      Turn around
    </button>
  );
}

export interface AdventureScreenProps {
  net: NetworkIndex;
  startAt: string;
  onExit: () => void;
  /** Opens the achievements screen from the Summary's "+n more". */
  onOpenAchievements?: () => void;
  phoneLandscape?: boolean;
}

export function AdventureScreen({ net, startAt, onExit, onOpenAchievements, phoneLandscape = false }: AdventureScreenProps) {
  const { geo, schematic, backdrop, districts } = networkLayout();
  const { mode, layout, setMode } = useLayoutMode(geo, schematic, 'schematic');

  const [run, setRun] = useState<RunState>(() => startRun(net, startAt, performance.now()));
  const [profile, setProfile] = useState<Profile>(() => loadProfile());
  const profileRef = useRef(profile);
  const persistedCount = useRef(0);
  const phone = usePhoneLayout();
  const { focusInput, blurInput } = useTypingInputControls();
  const [awaitingPortrait, setAwaitingPortrait] = useState(false);
  const rotationEnded = useRef(false);
  /** The Station a walk led to, until it is arrived at: that arrival rode no Line. */
  const walkedTo = useRef<string | null>(null);

  // An Adventure picked up where the last one stopped keeps its record (Seven
  // Colours, Round Trip); any other start begins a fresh one. Once, on mount.
  const adventureStarted = useRef(false);
  useEffect(() => {
    if (adventureStarted.current) return;
    adventureStarted.current = true;
    const resume = profileRef.current.adventure?.at === startAt;
    updateAchievements((state) => startAdventure(state, startAt, resume));
    profileRef.current = loadProfile();
  }, [startAt]);

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

    // Loaded fresh, as LineRunScreen does: another save since the ref was last
    // refreshed must not be written over.
    let updated = loadProfile();
    for (const station of pending) {
      const chars = stationAt(net, station.id)?.name.length ?? 0;
      const wpm = station.ms > 0 ? chars / 5 / (station.ms / 60_000) : 0;
      updated = recordStation(updated, station.id, wpm);
    }
    updated = saveAdventurePosition(updated, {
      at: run.at, arrivedFrom: run.arrivedFrom, line: run.line,
    });
    saveProfile(updated);

    // Each arrival is evaluated against the Stations just saved, so it also
    // covers what they unlocked. One reached on foot rode no Line.
    const arrivals = pending.map(({ id }) => {
      const walked = walkedTo.current === id;
      if (walked) walkedTo.current = null;
      return { id, line: walked ? null : run.line };
    });
    const at = Date.now();
    updateAchievements((state, visited) => {
      let next = state;
      const earned: EarnedTier[] = [];
      for (const arrival of arrivals) {
        const recorded = recordAdventureArrival(net, next, arrival.id, arrival.line, { visited, phone }, at);
        next = recorded.state;
        earned.push(...recorded.earned);
      }
      return { state: next, earned };
    });
    updated = loadProfile();
    profileRef.current = updated;
    setProfile(updated);
  }, [run.at, run.arrivedFrom, run.line, run.stationTimes, net, phone]);

  const onKey = useCallback((key: string) => {
    if (phoneLandscape || rotationEnded.current) return;
    if (key === 'Backspace') {
      setRun((prev) => turnAround(net, prev, performance.now()));
      return;
    }
    setRun((prev) => (prev.phase === 'typing' ? keyRun(net, prev, key, performance.now()) : prev));
  }, [net, phoneLandscape]);

  useGameInput(onKey, !phoneLandscape && run.phase === 'typing');

  useEffect(() => {
    if (run.phase === 'ended') blurInput();
  }, [run.phase, blurInput]);

  // Both record from the handler, never from inside the setRun updater, and
  // refresh the Profile ref so the next arrival's save keeps what they wrote.
  const onChoose = useCallback((dir: Direction) => {
    if (phoneLandscape || rotationEnded.current) return;
    setRun((prev) => chooseDirection(net, prev, dir, performance.now()));
    updateAchievements((state, visited) => recordJunctionChoice(net, state, { visited, phone }, Date.now()));
    profileRef.current = loadProfile();
  }, [net, phoneLandscape, phone]);

  const from = run.at;
  const onWalk = useCallback((to: string) => {
    if (phoneLandscape || rotationEnded.current) return;
    setRun((prev) => walkTo(net, prev, to, performance.now()));
    walkedTo.current = to;
    updateAchievements((state, visited) => recordWalk(net, state, from, to, { visited, phone }, Date.now()));
    profileRef.current = loadProfile();
  }, [net, phoneLandscape, phone, from]);

  if (phoneLandscape && (run.phase !== 'ended' || awaitingPortrait)) {
    return <PhoneLandscapeBlock fullScreen />;
  }

  if (run.phase === 'ended') {
    return <SummaryScreen net={net} run={run} onExit={onExit} onOpenAchievements={onOpenAchievements} />;
  }

  const line = run.line ? lineAt(net, run.line) : null;
  const heading = run.options[0]?.toward ?? null;
  const highlight = new Set(run.options.map((o) => o.next));

  // Adventure has no route to slice a window out of, so the shot is built from
  // where you came from, where you are, and wherever a junction could take you
  // next. Passing no window at all is what left the whole game at network zoom.
  const followWindow = [run.arrivedFrom, run.at, ...highlight]
    .filter((id): id is string => id !== null && id !== undefined)
    .map((id) => layout.get(id))
    .filter((p): p is Point => p !== undefined);

  // Centred on the middle of the segment being typed rather than on the
  // station just left, so the train's run across the shot is centred too. At
  // network zoom the difference was invisible; this close it is not.
  const departed = run.arrivedFrom ? layout.get(run.arrivedFrom) ?? null : null;
  const approaching = layout.get(run.at) ?? null;
  const centre =
    departed && approaching
      ? { x: (departed.x + approaching.x) / 2, y: (departed.y + approaching.y) / 2 }
      : approaching;

  return (
    <PlayLayout
      lineColour={run.line ? net.lines.get(run.line)?.colour ?? null : null}
      map={
        <MapCanvas
          net={net}
          layout={layout}
          visited={new Set(profile.visited)}
          activeStation={run.at}
          highlight={highlight}
          previousStation={run.arrivedFrom}
          // Real coastlines and district names belong under real geography.
          // Both are projected from lat/lng, so on the schematic diagram they
          // would sit at coordinates that mean nothing relative to the drawn
          // network.
          backdrop={mode === 'geo' ? backdrop : undefined}
          districts={mode === 'geo' ? districts : undefined}
          // The train is placed by typing progress, so it arrives exactly as
          // the name is finished. Recentre as each new station begins.
          trainProgress={
            run.typing.target.length > 0
              ? run.typing.cursor / run.typing.target.length
              : 0
          }
          trainErrorTick={run.errors}
          focusTo={followWindow}
          focus={arrived ? centre : null}
          focusKey={arrived ? run.at : 'intro'}
          // The typing panel overlays the lower third of the viewport.
          fitPadding={{ top: 0.06, right: 0.06, bottom: 0.38, left: 0.06 }}
          travelled={[startAt, ...run.visited]}
          trainColour={run.line ? net.lines.get(run.line)?.colour ?? null : null}
        />
      }
      panel={
        <>
          <button
            type="button"
            className="layout-toggle"
            onClick={() => setMode(mode === 'geo' ? 'schematic' : 'geo')}
          >
            {mode === 'geo' ? 'Schematic view' : 'Geographic view'}
          </button>

          <LineStrip net={net} line={run.line} at={run.at} />

          {run.phase === 'typing' && (
            <Prompt
              state={run.typing}
              errorTick={run.errors}
              onActivate={phone ? focusInput : undefined}
            />
          )}

          {run.phase === 'typing' && run.arrivedFrom && (
            phone ? (
              <MobileTurnAround
                onTurnAround={() => {
                  setRun((previous) => turnAround(net, previous, performance.now()));
                }}
              />
            ) : (
              <p className="hint"><kbd>Backspace</kbd> to turn around</p>
            )
          )}

          {run.phase === 'junction' && (
            <JunctionPicker
              net={net}
              options={run.options}
              walk={walkOptions(net, run.at)}
              onChoose={onChoose}
              onWalk={onWalk}
            />
          )}

          <HUD
            metrics={runMetrics(run, performance.now())}
            stationsThisRun={run.stationTimes.length}
            lineName={line?.name ?? null}
            toward={run.line ? heading : null}
          />

          <button type="button" onClick={() => setRun((prev) => endRun(prev))}>
            End journey
          </button>
        </>
      }
    />
  );
}
