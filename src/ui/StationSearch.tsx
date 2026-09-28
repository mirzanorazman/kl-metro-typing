import { useMemo, useState } from 'react';
import type { Station } from '../data/types';
import { linesOf, stationAt, type NetworkIndex } from '../engine/network';
import { sound } from '../audio/sound';

const MAX_RESULTS = 8;

/** Matches on name or official code. Prefix matches rank first. */
export function searchStations(
  net: NetworkIndex,
  query: string,
  filter?: (station: Station) => boolean,
): Station[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];

  const scored: { station: Station; score: number }[] = [];
  for (const station of net.stations.values()) {
    if (filter && !filter(station)) continue;
    const name = station.name.toLowerCase();
    const codes = Object.values(station.codes).map((c) => c.toLowerCase());

    let score = -1;
    if (name.startsWith(q)) score = 0;
    else if (codes.some((c) => c.startsWith(q))) score = 1;
    else if (name.includes(q)) score = 2;

    if (score >= 0) scored.push({ station, score });
  }

  scored.sort((a, b) => a.score - b.score || a.station.name.localeCompare(b.station.name));
  return scored.slice(0, MAX_RESULTS).map((s) => s.station);
}

export function StationSearch({
  net,
  onPick,
  filter,
  placeholder = 'Start from which station?',
  suggested,
}: {
  net: NetworkIndex;
  onPick: (id: string) => void;
  /** Restricts results, e.g. to a Rush Hour Line set. */
  filter?: (station: Station) => boolean;
  placeholder?: string;
  /** Listed while the search is empty; Enter picks the top result. Rush Hour's start step. */
  suggested?: string;
}) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => {
    const found = searchStations(net, query, filter);
    if (found.length > 0 || query.trim() !== '' || suggested === undefined) return found;
    const s = stationAt(net, suggested);
    return s ? [s] : [];
  }, [net, query, filter, suggested]);
  const pick = (id: string) => {
    sound.select();
    onPick(id);
  };

  return (
    <div className="station-search">
      <input
        type="text"
        value={query}
        autoFocus
        placeholder={placeholder}
        aria-label="Search stations"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || suggested === undefined || !results[0]) return;
          e.preventDefault();
          pick(results[0].id);
        }}
      />
      <ul>
        {results.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              data-suggested={
                query.trim() === '' && suggested !== undefined && s.id === suggested ? 'true' : undefined
              }
              onClick={() => pick(s.id)}
            >
              {s.name} <span className="codes">{linesOf(s).join(' · ')}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
