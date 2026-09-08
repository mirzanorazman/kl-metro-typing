import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LINE_CODES, type LineCode } from '../data/types';
import { networkLayout } from '../geo/networkLayout';
import { stationAt, type NetworkIndex } from '../engine/network';
import { loadProfile, saveProfile, type Theme } from '../engine/progress';
import { music, setMuted, sound } from '../audio/sound';
import { MapCanvas } from '../render/MapCanvas';
import { StationSearch } from './StationSearch';
import { DirectionChooser } from './DirectionChooser';
import { SoundToggle } from './SoundToggle';
import { ThemeToggle } from './ThemeToggle';
import { useKeyboard } from './useKeyboard';

export interface HomeMapProps {
  net: NetworkIndex;
  theme: Theme;
  onToggleTheme: () => void;
  onStartLine: (code: LineCode, from: string) => void;
  onPickStation: (stationId: string) => void;
  onOpenLeaderboard: () => void;
}

export function HomeMap({
  net,
  theme,
  onToggleTheme,
  onStartLine,
  onPickStation,
  onOpenLeaderboard,
}: HomeMapProps) {
  const { geo: layout, backdrop, districts, pxPerKm } = networkLayout();

  const profile = useMemo(() => loadProfile(), []);
  const visited = useMemo(() => new Set(profile.visited), [profile]);
  const [searching, setSearching] = useState(false);
  const [muted, setMutedPref] = useState(() => loadProfile().muted);

  useEffect(() => {
    music.startMenu();
    return () => music.stopMenu();
  }, []);

  const toggleSound = () => {
    const next = !muted;
    setMutedPref(next);
    setMuted(next);
    saveProfile({ ...loadProfile(), muted: next });
  };
  const [selected, setSelected] = useState<LineCode | null>(null);

  // Two-letter line codes, buffered in a ref rather than state: calling
  // callbacks from inside a state updater would be a render-phase update.
  const buffer = useRef('');
  const onKey = useCallback(
    (key: string) => {
      if (key.length !== 1 || !/[a-z]/i.test(key)) return;
      buffer.current = (buffer.current + key).toUpperCase().slice(-2);
      const match = LINE_CODES.find((c) => c === buffer.current);
      if (match) {
        buffer.current = '';
        setSelected(match);
      }
    },
    [],
  );
  // Suspended while the search field has focus or a line is selected, so typing
  // a station name or direction choice does not also fire line codes.
  useKeyboard(onKey, !searching && selected === null);

  const fitTo = useMemo(() => {
    if (!selected) return undefined;
    const line = net.lines.get(selected);
    if (!line) return undefined;
    return line.stations
      .map((id) => layout.get(id))
      .filter((p): p is NonNullable<typeof p> => p !== undefined);
  }, [selected, net, layout]);

  return (
    <div className="home-map">
      <MapCanvas
        net={net}
        layout={layout}
        visited={visited}
        activeStation={null}
        backdrop={backdrop}
        districts={districts}
        pxPerKm={pxPerKm}
        fitTo={fitTo}
        fitKey={selected ? `line:${selected}` : 'home'}
        // The picker overlays the right edge; pad that side so central KL
        // is not hidden behind it.
        fitPadding={{ top: 0.06, right: 0.45, bottom: 0.06, left: 0.06 }}
        emphasis={selected}
      />

      <header>
        <h1>MyRapid Typing</h1>
        <p className="tagline">Type your way across the Klang Valley.</p>
        <p className="progress">
          {visited.size} / {net.stations.size} stations visited
        </p>
      </header>

      <div className="line-picker">
        {profile.recovered && (
          <p role="status">Saved progress could not be read, so a fresh profile was started.</p>
        )}

        {profile.adventure && (
          <button
            type="button"
            onClick={() => {
              sound.select();
              onPickStation(profile.adventure!.at);
            }}
          >
            Resume from {stationAt(net, profile.adventure.at)?.name}
          </button>
        )}

        {selected ? (
          <DirectionChooser
            net={net}
            line={selected}
            onChoose={(from) => onStartLine(selected, from)}
            onCancel={() => setSelected(null)}
          />
        ) : (
          <>
            {[...net.lines.values()].map((line) => {
              const done = line.stations.filter((id) => visited.has(id)).length;
              return (
                <button
                  key={line.code}
                  type="button"
                  style={{ '--line-colour': line.colour } as React.CSSProperties}
                  onClick={() => {
                    sound.select();
                    setSelected(line.code);
                  }}
                >
                  <span className="code">{line.code}</span>
                  <span>{line.name}</span>
                  <span className="count">{done} / {line.stations.length}</span>
                </button>
              );
            })}

            <button type="button" onClick={() => {
              sound.select();
              setSearching((v) => !v);
            }}>
              Start anywhere
            </button>

            <button type="button" onClick={() => {
              sound.select();
              onOpenLeaderboard();
            }}>
              Leaderboard
            </button>

            <div className="control-cluster">
              <SoundToggle muted={muted} onToggle={toggleSound} />
              <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            </div>
            {searching && <StationSearch net={net} onPick={onPickStation} />}
          </>
        )}
      </div>

      <footer>
        An unofficial fan project. Not affiliated with Prasarana Malaysia or Rapid KL.
        Station names, codes, and line colours are public information.
      </footer>
    </div>
  );
}
