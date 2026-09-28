import { useCallback, useMemo, useRef, useState } from 'react';
import { LINE_CODES, type LineCode, type Station } from '../data/types';
import { networkLayout } from '../geo/networkLayout';
import { linesOf, stationAt, type NetworkIndex } from '../engine/network';
import { loadProfile, resetRushTips, saveProfile } from '../engine/progress';
import { rushLineSetKey, rushSuggestedStart } from '../engine/rushHour';
import { sound } from '../audio/sound';
import { MapCanvas } from '../render/MapCanvas';
import { LineBadge } from './LineBadge';
import { StationSearch } from './StationSearch';
import { useKeyboard } from './useKeyboard';

export interface RushSetupProps {
  net: NetworkIndex;
  onStart: (lineSet: LineCode[], at: string) => void;
  onBack: () => void;
}

/** Chooses a Rush Hour Line set, then a starting Station on it. */
export function RushSetup({ net, onStart, onBack }: RushSetupProps) {
  const { geo: layout, backdrop, districts } = networkLayout();
  const lines = useMemo(() => [...net.lines.values()], [net]);
  const [chosen, setChosen] = useState<LineCode[]>([]);
  const [picking, setPicking] = useState(false);
  const [tipsReset, setTipsReset] = useState(false);
  const bests = useMemo(() => loadProfile().rushHigh ?? {}, []);

  const toggle = useCallback((code: LineCode) => {
    sound.select();
    setChosen((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }, []);

  const buffer = useRef('');
  const onKey = useCallback(
    (key: string) => {
      if (key === 'Escape') return onBack();
      if (key === 'Enter') {
        if (chosen.length > 0) setPicking(true);
        return;
      }
      if (key >= '1' && key <= '9') {
        buffer.current = '';
        const line = lines[Number(key) - 1];
        if (line) toggle(line.code);
        return;
      }
      if (key.length !== 1 || !/[a-z]/i.test(key)) return;
      buffer.current = (buffer.current + key).toUpperCase().slice(-2);
      const match = LINE_CODES.find((c) => c === buffer.current);
      if (match) {
        buffer.current = '';
        toggle(match);
      }
    },
    [chosen.length, lines, onBack, toggle],
  );
  useKeyboard(onKey, !picking);

  const chosenSet = useMemo(() => new Set(chosen), [chosen]);
  const onSet = useCallback(
    (station: Station) => linesOf(station).some((l) => chosenSet.has(l)),
    [chosenSet],
  );
  const key = chosen.length > 0 ? rushLineSetKey(chosen) : null;
  const best = key ? bests[key] : undefined;
  const suggested = chosen.length > 0 ? rushSuggestedStart(net, chosen) : null;

  return (
    <div className="home-map rush-setup">
      <MapCanvas
        net={net}
        layout={layout}
        visited={new Set()}
        activeStation={null}
        backdrop={backdrop}
        districts={districts}
        fitPadding={{ top: 0.06, right: 0.45, bottom: 0.06, left: 0.06 }}
        emphasisSet={chosen.length > 0 ? chosenSet : null}
      />

      <header>
        <h1>Rush Hour</h1>
        <p className="tagline">Passengers pile up while you type. One overcrowded station ends the Run.</p>
      </header>

      <div className="mobile-dock">
        <div className="line-picker" role="group" aria-label="Choose a Line set">
          {!picking ? (
            <>
              <h2>1 · Lines</h2>
              <div className="line-list">
                {lines.map((line, i) => (
                  <button
                    key={line.code}
                    type="button"
                    aria-pressed={chosenSet.has(line.code)}
                    data-chosen={chosenSet.has(line.code) ? 'true' : undefined}
                    style={{ '--line-colour': line.colour } as React.CSSProperties}
                    onClick={() => toggle(line.code)}
                  >
                    <kbd data-testid="menu-key">{i + 1}</kbd>
                    <LineBadge code={line.code} colour={line.colour} />
                    <span>{line.name}</span>
                    <span className="count">{chosenSet.has(line.code) ? 'in' : ''}</span>
                  </button>
                ))}
              </div>
              <p className="hint">
                Press a number or type a line code to toggle. More lines spread the passengers out.
              </p>
              <button type="button" disabled={chosen.length === 0} onClick={() => setPicking(true)}>
                <kbd>Enter</kbd>
                <span>Choose a starting station</span>
              </button>
            </>
          ) : (
            <>
              <h2>
                2 · Start station{' '}
                {[...chosen].sort().map((c) => (
                  <LineBadge key={c} code={c} colour={net.lines.get(c)!.colour} />
                ))}
              </h2>
              <StationSearch
                net={net}
                filter={onSet}
                placeholder="Starting station on your lines"
                suggested={suggested ?? undefined}
                onPick={(id) => onStart([...chosen].sort(), id)}
              />
              {suggested && (
                <p className="hint">
                  <kbd>Enter</kbd> starts at {stationAt(net, suggested)?.name}, or search for another station.
                </p>
              )}
              <button type="button" onClick={() => setPicking(false)}>
                <span>Change lines</span>
              </button>
            </>
          )}
          {key && <p className="rush-best">Best for {key.replace(/\+/g, ' + ')}: {best ?? 0} delivered</p>}
          <button
            type="button"
            onClick={() => {
              saveProfile(resetRushTips(loadProfile()));
              setTipsReset(true);
            }}
          >
            <span>How to play</span>
          </button>
          {tipsReset && <p className="hint" role="status">Tips will show on your next Run.</p>}
          <button type="button" onClick={onBack}>
            <kbd>Esc</kbd>
            <span>Back to map</span>
          </button>
        </div>
      </div>
    </div>
  );
}
