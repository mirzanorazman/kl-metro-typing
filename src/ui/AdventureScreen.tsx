import { useCallback, useEffect, useRef, useState } from 'react';
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
import { MapCanvas } from '../render/MapCanvas';
import { Prompt } from '../render/Prompt';
import { HUD } from '../render/HUD';
import { LineStrip } from '../render/LineStrip';
import { useLayoutMode } from '../render/useLayoutMode';
import { PlayLayout } from './PlayLayout';
import { JunctionPicker } from './JunctionPicker';
import { useGameInput, useTypingInputControls } from './TypingInputProvider';
import { usePhoneLayout } from './usePhoneLayout';
import { SummaryScreen } from './SummaryScreen';

function MobileTurnAround({ onTurnAround }: { onTurnAround: () => void }) {
  const { focusInput } = useTypingInputControls();

  return (
    <button
      type="button"
      className="quick-run-refocus"
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
}

export function AdventureScreen({ net, startAt, onExit }: AdventureScreenProps) {
  const { geo, schematic, backdrop, districts } = networkLayout();
  const { mode, layout, setMode } = useLayoutMode(geo, schematic, 'schematic');

  const [run, setRun] = useState<RunState>(() => startRun(net, startAt, performance.now()));
  const [profile, setProfile] = useState<Profile>(() => loadProfile());
  const persistedCount = useRef(0);
  const phone = usePhoneLayout();

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
    if (run.stationTimes.length === persistedCount.current) return;
    persistedCount.current = run.stationTimes.length;

    const last = run.stationTimes[run.stationTimes.length - 1];
    if (!last) return;

    const chars = stationAt(net, last.id)?.name.length ?? 0;
    const wpm = last.ms > 0 ? chars / 5 / (last.ms / 60_000) : 0;
    const updated = saveAdventurePosition(recordStation(profile, last.id, wpm), {
      at: run.at, arrivedFrom: run.arrivedFrom, line: run.line,
    });
    saveProfile(updated);
    setProfile(updated);
  }, [run, net, profile]);

  const onKey = useCallback((key: string) => {
    if (key === 'Backspace') {
      setRun((prev) => turnAround(net, prev, performance.now()));
      return;
    }
    setRun((prev) => (prev.phase === 'typing' ? keyRun(net, prev, key, performance.now()) : prev));
  }, [net]);

  useGameInput(onKey, run.phase === 'typing');

  const onChoose = useCallback((dir: Direction) => {
    setRun((prev) => chooseDirection(net, prev, dir, performance.now()));
  }, [net]);

  const onWalk = useCallback((to: string) => {
    setRun((prev) => walkTo(net, prev, to, performance.now()));
  }, [net]);

  if (run.phase === 'ended') {
    return <SummaryScreen net={net} run={run} onExit={onExit} />;
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

          {run.phase === 'typing' && <Prompt state={run.typing} errorTick={run.errors} />}

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
