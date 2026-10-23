import type { NetworkIndex } from './network';
import { SKIP_MAX_AHEAD, SKIP_MIN_AHEAD, WRONG_KEY_STALL_MS } from './dispatchBalance';
import { fixItems } from './dispatchIncidents';
import { heldTrains, isLate, type SimState } from './dispatchSim';

export type TargetRef = { kind: 'signal' | 'skip'; train: number } | { kind: 'fix'; incident: number };
/** Delay is time Held for a Signal/Skip, or age for an Incident. */
export interface Target { ref: TargetRef; text: string; delayMs: number }
export interface Aim { typed: string; lock: TargetRef | null; mistyped: boolean; stallUntil: number }
export const EMPTY_AIM: Aim = { typed: '', lock: null, mistyped: false, stallUntil: 0 };
export interface KeyOutcome { aim: Aim; counted: boolean; correct: boolean; completed: TargetRef | null }

export function sameRef(a: TargetRef, b: TargetRef): boolean {
  return a.kind === b.kind && (a.kind === 'fix'
    ? b.kind === 'fix' && a.incident === b.incident
    : b.kind !== 'fix' && a.train === b.train);
}

/** Normal and fix names reserve first; lower Train IDs reserve Skip names first. */
export function visibleTargets(net: NetworkIndex, s: SimState): Target[] {
  const held = heldTrains(net, s);
  const trains = [...s.trains].sort((a, b) => a.id - b.id).filter((t) => t.stage === 'signal'
    && !held.has(t.id) && !s.outOfService[net.lines.get(t.line)!.stations[t.at]!]);
  const targets: Target[] = trains.map((t) => ({ ref: { kind: 'signal', train: t.id },
    text: net.stations.get(net.lines.get(t.line)!.stations[t.at]!)!.name, delayMs: t.ms }));
  for (const inc of [...s.incidents].sort((a, b) => a.id - b.id)) {
    if (s.outOfService[inc.place]) continue;
    const text = fixItems(net, inc, s)[inc.step];
    if (text !== undefined) targets.push({ ref: { kind: 'fix', incident: inc.id }, text,
      delayMs: s.shiftMs - inc.startedMs });
  }
  const names = new Set(targets.map((target) => target.text.toLowerCase()));
  for (const t of trains) {
    if (!isLate(net, s, t)) continue;
    const range = s.served.find((r) => r.line === t.line)!;
    const ids = net.lines.get(t.line)!.stations;
    for (let ahead = SKIP_MIN_AHEAD; ahead <= SKIP_MAX_AHEAD; ahead++) {
      const at = t.at + ahead * t.dir;
      if (at < range.from || at > range.to || s.outOfService[ids[at]!]) break;
      const text = net.stations.get(ids[at]!)!.name;
      if (names.has(text.toLowerCase())) continue;
      targets.push({ ref: { kind: 'skip', train: t.id }, text, delayMs: t.ms });
      names.add(text.toLowerCase());
      break;
    }
  }
  return targets;
}

export function candidates(targets: readonly Target[], aim: Aim): Target[] {
  return targets.filter((target) => (!aim.lock || sameRef(target.ref, aim.lock))
    && target.text.toLowerCase().startsWith(aim.typed.toLowerCase()));
}

export function reconcileAim(targets: readonly Target[], aim: Aim): Aim {
  return (aim.lock !== null || aim.typed !== '') && candidates(targets, aim).length === 0 ? EMPTY_AIM : aim;
}

function mostDelayed(targets: readonly Target[]): Target {
  const id = (ref: TargetRef) => ref.kind === 'fix' ? ref.incident : ref.train;
  return [...targets].sort((a, b) => b.delayMs - a.delayMs || id(a.ref) - id(b.ref))[0]!;
}

function complete(ref: TargetRef, counted: boolean): KeyOutcome {
  return { aim: ref.kind === 'fix' ? { ...EMPTY_AIM, lock: ref } : EMPTY_AIM,
    counted, correct: counted, completed: ref };
}

export function aimKey(targets: readonly Target[], aim: Aim, key: string, gameMs: number): KeyOutcome {
  aim = reconcileAim(targets, aim);
  const ignored: KeyOutcome = { aim, counted: false, correct: false, completed: null };
  if (gameMs < aim.stallUntil) return ignored;
  if (key === 'Enter') {
    // An exact name may remain a prefix of another: confirm it without
    // inventing an extra typed character or stealing the longer name.
    const exact = candidates(targets, aim).filter((target) => target.text.toLowerCase() === aim.typed.toLowerCase());
    return exact.length > 0 ? complete(mostDelayed(exact).ref, false) : ignored;
  }
  if (key.length !== 1 || key.charCodeAt(0) < 32 || (key.charCodeAt(0) >= 127 && key.charCodeAt(0) <= 159)) return ignored;
  const matching = candidates(targets, { ...aim, typed: aim.typed + key });
  if (matching.length === 0) return { aim: { ...aim, mistyped: true, stallUntil: gameMs + WRONG_KEY_STALL_MS },
    counted: true, correct: false, completed: null };
  const typed = aim.typed + matching[0]!.text[aim.typed.length]!;
  const distinct = new Set(matching.map((target) => target.text.toLowerCase()));
  const lock = aim.lock ?? (distinct.size === 1 ? mostDelayed(matching).ref : null);
  if (lock && matching.some((target) => sameRef(target.ref, lock) && target.text.toLowerCase() === typed.toLowerCase())) {
    return complete(lock, true);
  }
  return { aim: { typed, lock, mistyped: false, stallUntil: 0 }, counted: true, correct: true, completed: null };
}
