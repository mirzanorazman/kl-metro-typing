import { useMemo, useState } from 'react';
import type { Station } from '../data/types';
import { linesOf, type NetworkIndex } from '../engine/network';
import { sound } from '../audio/sound';

const MAX_RESULTS = 8;

/** Matches on name or official code. Prefix matches rank first. */
export function searchStations(net: NetworkIndex, query: string): Station[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];

  const scored: { station: Station; score: number }[] = [];
  for (const station of net.stations.values()) {
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
}: {
  net: NetworkIndex;
  onPick: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchStations(net, query), [net, query]);

  return (
    <div className="station-search">
      <input
        type="text"
        value={query}
        autoFocus
        placeholder="Start from which station?"
        aria-label="Search stations"
        onChange={(e) => setQuery(e.target.value)}
      />
      <ul>
        {results.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => {
                sound.select();
                onPick(s.id);
              }}
            >
              {s.name} <span className="codes">{linesOf(s).join(' · ')}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
