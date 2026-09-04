import { useCallback, useMemo, useRef, useState } from 'react';
import { LINE_CODES, type LineCode } from '../data/types';
import { loadNetworkData } from '../data/load';
import { projectStations, makeProjection } from '../geo/project';
import { loadBoundaries, projectBoundaries } from '../geo/boundaries';
import { stationAt, type NetworkIndex } from '../engine/network';
import { loadProfile } from '../engine/progress';
import { MapCanvas } from '../render/MapCanvas';
import { StationSearch } from './StationSearch';
import { useKeyboard } from './useKeyboard';

const VIEWPORT = { width: 1000, height: 800, padding: 80 };

export interface HomeMapProps {
  net: NetworkIndex;
  onPickLine: (code: LineCode) => void;
  onPickStation: (stationId: string) => void;
}

export function HomeMap({ net, onPickLine, onPickStation }: HomeMapProps) {
  const data = useMemo(() => loadNetworkData(), []);
  const layout = useMemo(() => projectStations(data.stations, VIEWPORT), [data]);

  // The backdrop MUST share the stations' projection, or the tracks drift off
  // the land. Same viewport, same fitted set.
  const backdrop = useMemo(() => {
    const proj = makeProjection(data.stations.map((s) => s.geo), VIEWPORT);
    return projectBoundaries(loadBoundaries(), proj);
  }, [data]);

  const profile = useMemo(() => loadProfile(), []);
  const visited = useMemo(() => new Set(profile.visited), [profile]);
  const [searching, setSearching] = useState(false);

  // Two-letter line codes, buffered in a ref rather than state: calling
  // onPickLine from inside a state updater would be a render-phase update.
  const buffer = useRef('');
  const onKey = useCallback(
    (key: string) => {
      if (key.length !== 1 || !/[a-z]/i.test(key)) return;
      buffer.current = (buffer.current + key).toUpperCase().slice(-2);
      const match = LINE_CODES.find((c) => c === buffer.current);
      if (match) {
        buffer.current = '';
        onPickLine(match);
      }
    },
    [onPickLine],
  );
  // Suspended while the search field has focus, so typing a station name
  // does not also fire line codes.
  useKeyboard(onKey, !searching);

  return (
    <div className="home-map">
      <MapCanvas
        net={net}
        layout={layout}
        visited={visited}
        activeStation={null}
        backdrop={backdrop}
        fitKey="home"
      />

      <header>
        <h1>MyRapid Typing</h1>
        <p className="tagline">Type your way across the Klang Valley.</p>
      </header>

      <div className="line-picker">
        {profile.recovered && (
          <p role="status">Saved progress could not be read, so a fresh profile was started.</p>
        )}

        {profile.adventure && (
          <button type="button" onClick={() => onPickStation(profile.adventure!.at)}>
            Resume from {stationAt(net, profile.adventure.at)?.name}
          </button>
        )}

        {[...net.lines.values()].map((line) => {
          const done = line.stations.filter((id) => visited.has(id)).length;
          return (
            <button
              key={line.code}
              type="button"
              style={{ '--line-colour': line.colour } as React.CSSProperties}
              onClick={() => onPickLine(line.code)}
            >
              <span className="code">{line.code}</span>
              <span>{line.name}</span>
              <span className="count">{done} / {line.stations.length}</span>
            </button>
          );
        })}

        <button type="button" onClick={() => setSearching((v) => !v)}>
          Start anywhere
        </button>
        {searching && <StationSearch net={net} onPick={onPickStation} />}
      </div>

      <footer>
        An unofficial fan project. Not affiliated with Prasarana Malaysia or Rapid KL.
        Station names, codes, and line colours are public information.
      </footer>
    </div>
  );
}
