import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LINE_CODES, type LineCode } from '../data/types';
import { networkLayout } from '../geo/networkLayout';
import { stationAt, type NetworkIndex } from '../engine/network';
import { loadProfile, saveProfile, type Theme } from '../engine/progress';
import { music, setMuted, sound } from '../audio/sound';
import { MapCanvas } from '../render/MapCanvas';
import { StationSearch } from './StationSearch';
import { DirectionChooser } from './DirectionChooser';
import { LineBadge } from './LineBadge';
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

  const lines = useMemo(() => [...net.lines.values()], [net]);
  const resumeAt = profile.adventure?.at ?? null;

  // The menu is numbered top to bottom, and the numbers are derived from that
  // order rather than written down twice, so the keys and the printed <kbd>
  // badges cannot drift apart. Resume takes 0 so that adding or removing it
  // never renumbers the lines beneath it.
  const searchKey = String(lines.length + 1);
  const leaderboardKey = String(lines.length + 2);

  const toggleSearch = useCallback(() => {
    sound.select();
    setSearching((v) => !v);
  }, []);

  const openLeaderboard = useCallback(() => {
    sound.select();
    onOpenLeaderboard();
  }, [onOpenLeaderboard]);

  const resume = useCallback(() => {
    if (!resumeAt) return;
    sound.select();
    onPickStation(resumeAt);
  }, [resumeAt, onPickStation]);

  const chooseLine = useCallback((code: LineCode) => {
    sound.select();
    setSelected(code);
  }, []);

  // Two-letter line codes, buffered in a ref rather than state: calling
  // callbacks from inside a state updater would be a render-phase update.
  const buffer = useRef('');
  const onKey = useCallback(
    (key: string) => {
      // Digits address the menu rows directly; letters still spell a line
      // code, so the two schemes never contend for the same keystroke.
      if (key >= '0' && key <= '9') {
        buffer.current = '';
        if (key === '0') return resume();
        const row = Number(key) - 1;
        if (row < lines.length) return chooseLine(lines[row]!.code);
        if (row === lines.length) return toggleSearch();
        if (row === lines.length + 1) return openLeaderboard();
        return;
      }

      if (key.length !== 1 || !/[a-z]/i.test(key)) return;
      buffer.current = (buffer.current + key).toUpperCase().slice(-2);
      const match = LINE_CODES.find((c) => c === buffer.current);
      if (match) {
        buffer.current = '';
        setSelected(match);
      }
    },
    [lines, resume, chooseLine, toggleSearch, openLeaderboard],
  );
  // Suspended while the search field has focus or a line is selected, so typing
  // a station name or direction choice does not also fire menu shortcuts.
  useKeyboard(onKey, !searching && selected === null);

  // Escape closes the search. It cannot ride on `useKeyboard` above, which is
  // deliberately inert while searching — and which suppresses the default for
  // every printable key, so leaving it live would stop the field being typed
  // into at all. A listener of its own, added only while the field is open.
  useEffect(() => {
    if (!searching) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSearching(false);
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [searching]);

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
        <h1>KL-Metro Typing</h1>
        <p className="tagline">Type your way across the Klang Valley.</p>
        <p className="progress">
          {visited.size} / {net.stations.size} stations visited
        </p>
      </header>

      {/* Grouped so the mobile breakpoint can stack the disclaimer above the
          docked picker as one flex column, instead of two independently
          absolutely-positioned elements that can overlap. Unstyled itself on
          desktop, so it does not disturb `.line-picker` and `footer`'s own
          absolute positioning there (they still position against
          `.home-map`, the nearest positioned ancestor). */}
      <div className="mobile-dock">
      <div className="line-picker">
        {profile.recovered && (
          <p role="status">Saved progress could not be read, so a fresh profile was started.</p>
        )}

        {profile.adventure && (
          <button type="button" onClick={resume}>
            <kbd data-testid="menu-key">0</kbd>
            <span>Resume from {stationAt(net, profile.adventure.at)?.name}</span>
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
            <div className="line-list">
              {lines.map((line, i) => {
                const done = line.stations.filter((id) => visited.has(id)).length;
                return (
                  <button
                    key={line.code}
                    type="button"
                    style={{ '--line-colour': line.colour } as React.CSSProperties}
                    onClick={() => chooseLine(line.code)}
                  >
                    <kbd data-testid="menu-key">{i + 1}</kbd>
                    <LineBadge code={line.code} colour={line.colour} />
                    <span>{line.name}</span>
                    <span className="count">{done} / {line.stations.length}</span>
                  </button>
                );
              })}
            </div>

            <button type="button" onClick={toggleSearch}>
              <kbd data-testid="menu-key">{searchKey}</kbd>
              <span>Start anywhere</span>
            </button>

            <button type="button" onClick={openLeaderboard}>
              <kbd data-testid="menu-key">{leaderboardKey}</kbd>
              <span>Leaderboard</span>
            </button>

            <p className="hint">
              Press a number, or type a line code. {searching && <><kbd>Esc</kbd> to close.</>}
            </p>

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
    </div>
  );
}
