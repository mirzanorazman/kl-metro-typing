import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LINE_CODES, type LineCode } from '../data/types';
import { networkLayout } from '../geo/networkLayout';
import type { NetworkIndex } from '../engine/network';
import { loadProfile, resetRushTips, saveProfile } from '../engine/progress';
import { rushLineSetKey, rushRandomStart } from '../engine/rushHour';
import { music, sound } from '../audio/sound';
import { MapCanvas } from '../render/MapCanvas';
import { LineBadge } from './LineBadge';
import { useKeyboard } from './useKeyboard';

export interface RushSetupProps {
  net: NetworkIndex;
  onStart: (lineSet: LineCode[], at: string) => void;
  onBack: () => void;
}

/** Chooses a Rush Hour Line set; Start begins at a random Station on it. */
export function RushSetup({ net, onStart, onBack }: RushSetupProps) {
  const { geo: layout, backdrop, districts } = networkLayout();
  const lines = useMemo(() => [...net.lines.values()], [net]);
  const [chosen, setChosen] = useState<LineCode[]>([]);
  const [tipsReset, setTipsReset] = useState(false);
  const bests = useMemo(() => loadProfile().rushHigh ?? {}, []);

  const toggle = useCallback((code: LineCode) => {
    sound.select();
    setChosen((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }, []);

  useEffect(() => {
    music.play('rushSetup');
    return () => music.stop('rushSetup');
  }, []);

  const start = useCallback(() => {
    if (chosen.length === 0) return;
    const lineSet = [...chosen].sort();
    onStart(lineSet, rushRandomStart(net, lineSet));
  }, [chosen, net, onStart]);

  const buffer = useRef('');
  const onKey = useCallback(
    (key: string) => {
      if (key === 'Escape') return onBack();
      if (key === 'Enter') return start();
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
    [lines, onBack, start, toggle],
  );
  useKeyboard(onKey);

  const chosenSet = useMemo(() => new Set(chosen), [chosen]);
  const key = chosen.length > 0 ? rushLineSetKey(chosen) : null;
  const best = key ? bests[key] : undefined;

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
          <h2>Lines</h2>
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
          <button type="button" disabled={chosen.length === 0} onClick={start}>
            <kbd>Enter</kbd>
            <span>Start</span>
          </button>
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
