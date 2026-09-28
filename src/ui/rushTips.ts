import type { RushState } from '../engine/rushHour';

/** One-time Rush Hour tips, in the order they queue when moments coincide. */
export const RUSH_TIPS = [
  { id: 'start', text: 'Type the station name to start. Passengers appear near your train.' },
  { id: 'board', text: 'Passengers board automatically. The badge shows the line they want.' },
  { id: 'deliver', text: 'Passengers get off at any station on their line.' },
  { id: 'junction', text: 'Pick a way by its number. ↓ = passengers getting off there, dots = people waiting.' },
  { id: 'walk', text: 'Walk to switch lines. Typing locks for 5 s.' },
  { id: 'overflow', text: 'A full station starts to overflow. Visit it to reset the ring — if it fills, the Run ends.' },
] as const;

export type RushTipId = (typeof RUSH_TIPS)[number]['id'];

export function rushTipText(id: RushTipId): string {
  return RUSH_TIPS.find((t) => t.id === id)!.text;
}

/**
 * The tip moments that happened between two states, minus those `seen`.
 * `start` is not a moment: the screen shows it while the Run is ready.
 */
export function newRushTips(prev: RushState, next: RushState, seen: ReadonlySet<string>): RushTipId[] {
  const hit = new Set<RushTipId>();
  const aboard = new Set(prev.load.map((p) => p.id));
  if (next.load.some((p) => !aboard.has(p.id))) hit.add('board');
  if (next.delivered > prev.delivered) hit.add('deliver');
  if (next.stage === 'junction' && prev.stage !== 'junction') {
    hit.add('junction');
    if (next.walks.length > 0) hit.add('walk');
  }
  const ringStarted = Object.entries(next.queues).some(
    ([id, q]) => q.overflowMs > 0 && (prev.queues[id]?.overflowMs ?? 0) === 0,
  );
  if (ringStarted) hit.add('overflow');
  return RUSH_TIPS.map((t) => t.id).filter((id) => hit.has(id) && !seen.has(id));
}
