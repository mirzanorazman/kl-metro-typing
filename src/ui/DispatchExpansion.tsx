import { useCallback, useMemo, useRef, useState } from 'react';
import type { CareerState } from '../engine/dispatch';
import { ERAS, eraFor } from '../engine/dispatchNetwork';
import { aimKey, candidates, EMPTY_AIM, sameRef, type Aim, type Target } from '../engine/dispatchTargets';
import type { NetworkIndex } from '../engine/network';
import { LineBadge } from './LineBadge';
import { useGameInput } from './TypingInputProvider';

export interface DispatchExpansionProps {
  net: NetworkIndex;
  career: CareerState;
  onPick: (pick: number) => void;
  /** False while something else (a tip) owns the keys. */
  active?: boolean;
}

/**
 * Between Shifts: the offered Expansions, picked by typing an offer's far-end
 * Station or clicking it. Typing narrows exactly as Signals do, and Enter
 * picks an exact shorter name while a longer one still matches. These keys
 * choose, they are not part of the Career, so none are recorded; the pick is
 * logged as an action by the screen.
 */
export function DispatchExpansion({ net, career, onPick, active = true }: DispatchExpansionProps) {
  const { offers } = career;
  // An offer's index stands in for a Train id, so the Signal narrowing applies as is.
  const targets = useMemo<Target[]>(() => offers.map((offer, i) => ({
    ref: { kind: 'signal', train: i }, text: net.stations.get(offer.farEnd)?.name ?? offer.farEnd, delayMs: 0,
  })), [net, offers]);
  const [aim, setAim] = useState<Aim>(EMPTY_AIM);
  const aimRef = useRef(aim);
  const picked = useRef(false);

  const pick = useCallback((index: number) => {
    if (picked.current) return;
    picked.current = true;
    onPick(index);
  }, [onPick]);

  const onKey = useCallback((key: string) => {
    if (picked.current) return;
    if (targets.length === 0) {
      if (key === 'Enter') pick(-1);
      return;
    }
    let next: Aim;
    if (key === 'Backspace' || key === 'Escape') {
      next = EMPTY_AIM;
    } else {
      const outcome = aimKey(targets, aimRef.current, key, 0);
      if (outcome.completed && outcome.completed.kind !== 'fix') return pick(outcome.completed.train);
      // Off the clock a wrong key shows, but never stalls.
      next = { ...outcome.aim, stallUntil: 0 };
    }
    aimRef.current = next;
    setAim(next);
  }, [pick, targets]);

  useGameInput(onKey, active);

  const era = ERAS[eraFor(career.cleared)]!;
  const aimed = aim.typed !== '' || aim.lock ? candidates(targets, aim) : [];
  const typed = aim.typed.toLowerCase();
  const exact = aimed.find((t) => t.text.toLowerCase() === typed);
  const longer = aimed.some((t) => t.text.length > typed.length);

  return (
    <section className="dispatch-expansion" role="region" aria-label="Expansion">
      <h2>Shift {career.shift} cleared</h2>
      <p className="dispatch-era">Era: {era.label}</p>
      {offers.length === 0 ? (
        <>
          <p>Your network is complete</p>
          <p className="hint">Every Shift from here is a little busier than the last.</p>
          <button type="button" onClick={() => pick(-1)}>
            <kbd>Enter</kbd> Continue
          </button>
        </>
      ) : (
        <>
          <p className="hint">Type a far-end Station to grow your network there, or click it.</p>
          <ul className="dispatch-offers">
            {offers.map((offer, i) => {
              const target = targets[i]!;
              const line = net.lines.get(offer.line);
              const isAimed = aimed.some((t) => sameRef(t.ref, target.ref));
              const done = isAimed ? Math.min(aim.typed.length, target.text.length) : 0;
              const count = offer.added.length;
              return (
                <li key={`${offer.line}:${offer.from}-${offer.to}`}>
                  <button
                    type="button"
                    className="dispatch-offer"
                    data-candidate={isAimed ? 'true' : undefined}
                    onClick={() => pick(i)}
                  >
                    {line && <LineBadge code={line.code} colour={line.colour} />}
                    <span className="dispatch-offer-name">
                      {done > 0 && <span className="dispatch-typed">{target.text.slice(0, done)}</span>}
                      {target.text.slice(done)}
                    </span>
                    <span className="dispatch-offer-size">
                      {count === 0 ? 'Shared track, more Trains' : `+${count} Station${count === 1 ? '' : 's'}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {aim.mistyped && <p className="prompt-feedback" role="status">Wrong key</p>}
          {exact && longer && (
            <p className="dispatch-confirm" role="note"><kbd>Enter</kbd> to choose {exact.text}</p>
          )}
        </>
      )}
    </section>
  );
}
