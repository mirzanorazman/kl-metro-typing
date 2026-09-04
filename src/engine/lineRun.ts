import type { LineCode } from '../data/types';
import type { NetworkIndex } from './network';

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
