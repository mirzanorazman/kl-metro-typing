import { useCallback } from 'react';
import { lineAt, stationAt, type Direction, type NetworkIndex } from '../engine/network';
import { deliverableAt, queueCapacity, type RushState } from '../engine/rushHour';
import { LineBadge } from './LineBadge';
import { useGameInput, useTypingInputControls } from './TypingInputProvider';

export type RushJunctionChoice = { kind: 'rail'; dir: Direction } | { kind: 'walk'; to: string };

/** Rail Directions first, then Walks; the keys are 1, 2, 3… in this order. */
export function rushJunctionChoices(run: Pick<RushState, 'options' | 'walks'>): RushJunctionChoice[] {
  return [
    ...run.options.map((dir) => ({ kind: 'rail' as const, dir })),
    ...run.walks.map((to) => ({ kind: 'walk' as const, to })),
  ];
}

function QueuePips({ count, capacity, filling }: { count: number; capacity: number; filling: boolean }) {
  return (
    <span className="rush-pips" data-filling={filling ? 'true' : undefined} aria-label={`${count} of ${capacity} waiting`}>
      {Array.from({ length: capacity }, (_, i) => (
        <span key={i} data-on={i < count ? 'true' : undefined} />
      ))}
    </span>
  );
}

export interface RushJunctionProps {
  net: NetworkIndex;
  run: RushState;
  onChoose: (dir: Direction) => void;
  onWalk: (to: string) => void;
}

/**
 * Rush Hour's Junction chooser: per way only the next Station, how many of
 * the Load get off there, and its Queue. Adventure keeps `JunctionPicker`.
 */
export function RushJunction({ net, run, onChoose, onWalk }: RushJunctionProps) {
  const { focusInput } = useTypingInputControls();
  const choices = rushJunctionChoices(run);
  const take = useCallback((c: RushJunctionChoice) => {
    focusInput();
    if (c.kind === 'rail') onChoose(c.dir);
    else onWalk(c.to);
  }, [focusInput, onChoose, onWalk]);
  const onKey = useCallback((key: string) => {
    const n = Number(key);
    const choice = Number.isInteger(n) && n >= 1 ? choices[n - 1] : undefined;
    if (choice) take(choice);
  }, [choices, take]);
  useGameInput(onKey);

  return (
    <div className="junction rush-junction" role="group" aria-label="Choose a direction">
      <h2>Which way?</h2>
      <ul>
        {choices.map((c, i) => {
          if (c.kind === 'walk') {
            return (
              <li key={`walk-${c.to}`}>
                <button type="button" onClick={() => take(c)}>
                  <kbd>{i + 1}</kbd>
                  <span aria-hidden="true">🚶</span>
                  <span className="rush-junction-next">Walk to {stationAt(net, c.to)?.name}</span>
                </button>
              </li>
            );
          }
          const line = lineAt(net, c.dir.line);
          const queue = run.queues[c.dir.next];
          const off = deliverableAt(net, run, c.dir.next);
          return (
            <li key={`${c.dir.line}-${c.dir.next}`}>
              <button
                type="button"
                style={{ '--line-colour': line?.colour } as React.CSSProperties}
                onClick={() => take(c)}
              >
                <kbd>{i + 1}</kbd>
                {line && <LineBadge code={c.dir.line} colour={line.colour} />}
                <span className="rush-junction-next">{stationAt(net, c.dir.next)?.name}</span>
                {off > 0 && <strong className="rush-junction-off" aria-label={`${off} get off`}>↓{off}</strong>}
                <QueuePips
                  count={queue?.passengers.length ?? 0}
                  capacity={queueCapacity(net, c.dir.next)}
                  filling={(queue?.overflowMs ?? 0) > 0}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
