import { useMemo, useState } from 'react';
import { stationAt, type NetworkIndex } from '../engine/network';
import { loadProfile } from '../engine/progress';
import { StationSearch } from './StationSearch';

export function HomeScreen({
  net,
  onStart,
}: {
  net: NetworkIndex;
  onStart: (stationId: string) => void;
}) {
  const profile = useMemo(() => loadProfile(), []);
  const [choosing, setChoosing] = useState(false);
  const visited = new Set(profile.visited);
  const total = net.stations.size;

  return (
    <div className="home">
      <h1>MyRapid Typing</h1>
      <p className="tagline">Type your way across the Klang Valley.</p>

      {profile.recovered && (
        <p role="status">Saved progress could not be read, so a fresh profile was started.</p>
      )}

      <p>{visited.size} / {total} stations visited</p>

      <ul className="line-progress">
        {[...net.lines.values()].map((line) => {
          const done = line.stations.filter((id) => visited.has(id)).length;
          return (
            <li key={line.code}>
              <span style={{ '--line-colour': line.colour } as React.CSSProperties}>
                {line.code}
              </span>
              <span>{line.name}</span>
              <progress
                aria-label={`${line.name} progress`}
                value={done}
                max={line.stations.length}
              />
              <span>{done} / {line.stations.length}</span>
            </li>
          );
        })}
      </ul>

      {profile.adventure && (
        <button type="button" onClick={() => onStart(profile.adventure!.at)}>
          Resume from {stationAt(net, profile.adventure.at)?.name}
        </button>
      )}

      <button type="button" onClick={() => setChoosing(true)}>Start a new journey</button>
      {choosing && <StationSearch net={net} onPick={onStart} />}

      <footer>
        An unofficial fan project. Not affiliated with Prasarana Malaysia or Rapid KL.
        Station names, codes, and line colours are public information.
      </footer>
    </div>
  );
}
