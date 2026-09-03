import { useCallback } from 'react';
import { lineAt, stationAt, type Direction, type NetworkIndex } from '../engine/network';
import { useKeyboard } from './useKeyboard';

/** Resolves a keystroke to an option: a 1-based number, or a line code letter. */
export function matchOption(options: Direction[], key: string): Direction | undefined {
  const asNumber = Number(key);
  if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= options.length) {
    return options[asNumber - 1];
  }
  const k = key.toLowerCase();
  return options.find((o) => o.line.toLowerCase().startsWith(k));
}

export interface JunctionPickerProps {
  net: NetworkIndex;
  options: Direction[];
  walk: string[];
  onChoose: (dir: Direction) => void;
  onWalk: (stationId: string) => void;
}

export function JunctionPicker({ net, options, walk, onChoose, onWalk }: JunctionPickerProps) {
  const onKey = useCallback(
    (key: string) => {
      const match = matchOption(options, key);
      if (match) onChoose(match);
    },
    [options, onChoose],
  );
  useKeyboard(onKey);

  return (
    <div className="junction" role="group" aria-label="Choose a direction">
      <h2>Which way?</h2>
      <ul>
        {options.map((dir, i) => {
          const line = lineAt(net, dir.line);
          return (
            <li key={`${dir.line}-${dir.next}`}>
              <button
                type="button"
                style={{ '--line-colour': line?.colour } as React.CSSProperties}
                onClick={() => onChoose(dir)}
              >
                <kbd>{i + 1}</kbd>
                <strong>{dir.line}</strong>
                <span>{line?.name}</span>
                <span>toward {dir.toward}</span>
                <em>next: {stationAt(net, dir.next)?.name}</em>
              </button>
            </li>
          );
        })}
        {walk.map((id) => (
          <li key={`walk-${id}`}>
            <button type="button" onClick={() => onWalk(id)}>
              walk to {stationAt(net, id)?.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
