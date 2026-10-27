import { PLATFORM_CAPACITY } from '../engine/dispatchBalance';
import { PERSON } from '../render/DispatchOverlay';
import type { DispersalPop } from '../render/usePassengerMoments';

/** The person the map's dispersal draws, at text size. */
function Person() {
  return (
    <svg className="crowd-meter-person" viewBox="-4 -11 8 16" aria-hidden="true">
      <circle cy={-8.5} r={2} />
      <path d={PERSON} />
    </svg>
  );
}

/**
 * A Crowd surge's crowd in the typing row while its fix is aimed, so the
 * player sees it grow where they are looking. Amber once the platform is
 * full, where it starts counting toward closing by crowding. Not a live
 * region: it changes too often to announce.
 */
export function LiveCrowd({ waiting }: { waiting: number }) {
  return (
    <p className="crowd-meter" data-testid="crowd-meter"
      data-full={waiting >= PLATFORM_CAPACITY ? 'true' : undefined}>
      <Person />
      {waiting} waiting
    </p>
  );
}

/**
 * A fixed Crowd surge in the typing row, for as long as the map's dispersal:
 * the count drops to who is left (the old one slides out, the new one in),
 * with how many went. Under reduced motion only the new count shows.
 */
export function ClearedCrowd({ pop }: { pop: DispersalPop }) {
  return (
    <p className="crowd-meter" data-testid="crowd-meter" data-cleared="true" role="status">
      <Person />
      <span className="crowd-meter-count" aria-hidden="true">
        {!pop.still && <span className="crowd-meter-from" data-count="from">{pop.from}</span>}
        <span className="crowd-meter-to" data-count="to">{pop.to}</span>
      </span>
      <span aria-hidden="true"> waiting</span>
      <span className="crowd-meter-gone" aria-hidden="true">−{pop.count}</span>
      <span className="crowd-meter-said">{pop.to} waiting, {pop.count} dispersed</span>
    </p>
  );
}
