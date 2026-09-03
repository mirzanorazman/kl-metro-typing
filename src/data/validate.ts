import type { LineCode, NetworkData } from './types';

/** Klang Valley bounding box. Anything outside is a transcription error. */
const BOUNDS = { minLat: 2.85, maxLat: 3.3, minLng: 101.35, maxLng: 101.8 };

/** Returns a list of human-readable problems. Empty means the data is sound. */
export function validateNetworkData(data: NetworkData): string[] {
  const errors: string[] = [];
  const byId = new Map(data.stations.map((s) => [s.id, s]));

  if (byId.size !== data.stations.length) {
    errors.push('duplicate station ids in stations.json');
  }

  /** station id -> lines that list it, built from lines.json */
  const listedBy = new Map<string, Set<LineCode>>();

  for (const line of data.lines) {
    const seen = new Set<string>();
    for (const id of line.stations) {
      if (seen.has(id)) errors.push(`line ${line.code} lists ${id} more than once`);
      seen.add(id);

      if (!byId.has(id)) {
        errors.push(`line ${line.code} references unknown station ${id}`);
        continue;
      }
      const set = listedBy.get(id) ?? new Set<LineCode>();
      set.add(line.code);
      listedBy.set(id, set);
    }
    if (line.stations.length < 2) {
      errors.push(`line ${line.code} has fewer than two stations`);
    }
  }

  for (const station of data.stations) {
    const listed = listedBy.get(station.id);
    if (!listed || listed.size === 0) {
      errors.push(`station ${station.id} is not on any line`);
      continue;
    }

    const declared = new Set(Object.keys(station.codes) as LineCode[]);
    for (const code of listed) {
      if (!declared.has(code)) {
        errors.push(`station ${station.id} is on line ${code} but has no ${code} code`);
      }
    }
    for (const code of declared) {
      if (!listed.has(code)) {
        errors.push(`station ${station.id} declares a ${code} code but is not on line ${code}`);
      }
    }

    const { lat, lng } = station.geo;
    const inBounds =
      lat >= BOUNDS.minLat && lat <= BOUNDS.maxLat &&
      lng >= BOUNDS.minLng && lng <= BOUNDS.maxLng;
    if (!inBounds) {
      errors.push(`station ${station.id} has coordinates outside the Klang Valley: ${lat}, ${lng}`);
    }

    if (!(station.demand >= 1)) {
      errors.push(`station ${station.id} has an invalid demand weight`);
    }
  }

  for (const link of data.links) {
    if (link.a === link.b) errors.push(`walk link joins ${link.a} to itself`);
    if (!byId.has(link.a)) errors.push(`walk link references unknown station ${link.a}`);
    if (!byId.has(link.b)) errors.push(`walk link references unknown station ${link.b}`);
  }

  return errors;
}
