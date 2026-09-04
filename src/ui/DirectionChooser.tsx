import { useCallback } from 'react';
import type { LineCode } from '../data/types';
import { terminiOf } from '../engine/lineRun';
import { lineAt, stationAt, type NetworkIndex } from '../engine/network';
import { useKeyboard } from './useKeyboard';

export interface DirectionChooserProps {
  net: NetworkIndex;
  line: LineCode;
  onChoose: (fromStationId: string) => void;
  onCancel: () => void;
}

export function DirectionChooser({ net, line, onChoose, onCancel }: DirectionChooserProps) {
  const def = lineAt(net, line);
  const [head, tail] = terminiOf(net, line);
  // Starting at one terminus means heading for the other.
  const ends = [
    { from: head, toward: tail },
    { from: tail, toward: head },
  ];

  const onKey = useCallback(
    (key: string) => {
      if (key === 'Escape') return onCancel();
      const n = Number(key);
      if (Number.isInteger(n) && n >= 1 && n <= ends.length) onChoose(ends[n - 1]!.from);
    },
    // `ends` is derived from props and stable per render; the callback only
    // needs to change when the line does.
    [onChoose, onCancel, head, tail],
  );
  useKeyboard(onKey);

  return (
    <div className="junction" role="group" aria-label="Choose a direction">
      <h2>
        <span style={{ color: def?.colour }}>{line}</span> {def?.name} — which way?
      </h2>
      <ul>
        {ends.map((e, i) => (
          <li key={e.from}>
            <button
              type="button"
              style={{ '--line-colour': def?.colour } as React.CSSProperties}
              onClick={() => onChoose(e.from)}
            >
              <kbd>{i + 1}</kbd>
              <span>Start at {stationAt(net, e.from)?.name}</span>
              <em>toward {stationAt(net, e.toward)?.name}</em>
            </button>
          </li>
        ))}
      </ul>
      <p className="hint"><kbd>Esc</kbd> to go back</p>
    </div>
  );
}
