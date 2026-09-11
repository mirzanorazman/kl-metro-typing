import type { LineCode } from '../data/types';
import type { NetworkIndex } from './network';
import { chooseTowards, endRun, keyRun, type RunState } from './run';

/** The two terminus station ids of a line, in data order. */
export function terminiOf(net: NetworkIndex, code: LineCode): [string, string] {
  const line = net.lines.get(code);
  if (!line || line.stations.length < 2) return ['', ''];
  return [line.stations[0]!, line.stations[line.stations.length - 1]!];
}

/**
 * Every station on a line, ordered from the chosen terminus.
 *
 * A Line Run has no decisions in it — the route is fixed — which is what makes
 * it the legible entry point: pick the line you know and type it.
 * Returns an empty array if `from` is not one of the line's termini.
 */
export function lineRunRoute(
  net: NetworkIndex,
  code: LineCode,
  from: string,
): string[] {
  const line = net.lines.get(code);
  if (!line) return [];
  const [head, tail] = terminiOf(net, code);
  if (from === head) return [...line.stations];
  if (from === tail) return [...line.stations].reverse();
  return [];
}

/**
 * One keystroke in a Line Run.
 *
 * A Line Run has no decisions in it, which the generic Run engine does not
 * know: it would prompt at every interchange and reverse at the terminus.
 * This wraps `keyRun` with the two rules that make the route fixed.
 */
export function keyLineRun(
  net: NetworkIndex,
  route: readonly string[],
  state: RunState,
  key: string,
  now: number,
): RunState {
  if (state.phase !== 'typing') return state;

  let next = keyRun(net, state, key, now);

  // Route complete: end here rather than letting the engine reverse.
  if (next.stationTimes.length >= route.length) return endRun(next);

  // Interchange: stay on the line instead of prompting the player.
  if (next.phase === 'junction') {
    const target = route[next.stationTimes.length];
    if (target) next = chooseTowards(net, next, target, now);
  }

  return next;
}
