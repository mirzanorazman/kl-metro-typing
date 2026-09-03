import type { Line, Station, WalkLink, NetworkData } from './types';
import linesJson from './lines.json';
import stationsJson from './stations.json';
import linksJson from './links.json';

/** Single entry point for network data. Nothing else imports the JSON directly. */
export function loadNetworkData(): NetworkData {
  return {
    lines: linesJson as Line[],
    stations: stationsJson as Station[],
    links: linksJson as WalkLink[],
  };
}
