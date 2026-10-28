import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LINE_CODES, type LineCode } from '../data/types';
import { networkLayout } from '../geo/networkLayout';
import { stationAt, type NetworkIndex } from '../engine/network';
import { loadProfile, saveProfile, type Theme } from '../engine/progress';
import { bestShifts, loadDispatchBoard } from '../data/dispatchBoardStore';
import { music, setMuted, sound } from '../audio/sound';
import { MapCanvas } from '../render/MapCanvas';
import { entranceTiming } from '../render/entrance';
import { DirectionChooser } from './DirectionChooser';
import { ExploreList } from './ExploreList';
import { HomeModes } from './HomeModes';
import { SoundToggle } from './SoundToggle';
import { ThemeToggle } from './ThemeToggle';
import { useKeyboard } from './useKeyboard';

export interface HomeMapProps {
  net: NetworkIndex;
  theme: Theme;
  onToggleTheme: () => void;
  onStartLine: (code: LineCode, from: string) => void;
  /** Starts a Quick Run on a Line and Direction the caller draws at random. */
  onStartQuick?: () => void;
  onPickStation: (stationId: string) => void;
  onOpenLeaderboard: () => void;
  /** Opens a Dispatcher Career. Omitted where Dispatcher is not offered. */
  onOpenDispatcher?: () => void;
  /**
   * Whether to play the opening draw-on. App withholds it on the returns
   * from a run, so the animation opens the session rather than taxing every
   * trip back to the map.
   */
  intro?: boolean;
}

export function HomeMap({
  net,
  theme,
  onToggleTheme,
  onStartLine,
  onStartQuick,
  onPickStation,
  onOpenLeaderboard,
  onOpenDispatcher,
  intro = true,
}: HomeMapProps) {
  const { geo: layout, backdrop, districts, pxPerKm } = networkLayout();

  // Read once, at mount: the player can cut the opening short, and after
  // that the prop saying it was owed must not put it back.
  const [showIntro, setShowIntro] = useState(intro);
  const timing = useMemo(() => entranceTiming(net), [net]);

  // Any deliberate input cuts the opening short and snaps the map to its
  // settled state. Dropping the timing mid-flight is what does it: the CSS
  // animations go with it, leaving every mark at its final value.
  useEffect(() => {
    if (!showIntro) return;
    const skip = () => setShowIntro(false);
    window.addEventListener('keydown', skip);
    window.addEventListener('pointerdown', skip);
    return () => {
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
    };
  }, [showIntro]);

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
  // The panel opens on the kinds of play; the Line list lives one level down.
  const [view, setView] = useState<'modes' | 'explore'>('modes');

  const lines = useMemo(() => [...net.lines.values()], [net]);
  const resumeAt = profile.adventure?.at ?? null;
  const resumeName = resumeAt ? stationAt(net, resumeAt)?.name ?? null : null;
  const shiftsBest = useMemo(() => bestShifts(loadDispatchBoard()), []);

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

  const openDispatcher = useCallback(() => {
    if (!onOpenDispatcher) return;
    sound.select();
    onOpenDispatcher();
  }, [onOpenDispatcher]);

  const startQuick = useCallback(() => {
    if (!onStartQuick) return;
    sound.select();
    onStartQuick();
  }, [onStartQuick]);

  const openExplore = useCallback(() => {
    sound.select();
    setView('explore');
  }, []);

  // Two-letter line codes, buffered in a ref rather than state: calling
  // callbacks from inside a state updater would be a render-phase update.
  const buffer = useRef('');
  const onKey = useCallback(
    (key: string) => {
      // Digits address the printed keys of whichever view is showing; letters
      // still spell a line code, so the two schemes never contend for the
      // same keystroke. 0 resumes in both views.
      if (key >= '0' && key <= '9') {
        buffer.current = '';
        if (key === '0') return resume();
        if (view === 'modes') {
          if (key === '1') return openDispatcher();
          if (key === '2') return startQuick();
          if (key === '3') return openExplore();
          if (key === '4') return openLeaderboard();
          return;
        }
        const row = Number(key) - 1;
        if (row < lines.length) return chooseLine(lines[row]!.code);
        if (row === lines.length) return toggleSearch();
        return;
      }

      if (key === 'Escape') {
        buffer.current = '';
        if (view === 'explore') setView('modes');
        return;
      }

      if (key.length !== 1 || !/[a-z]/i.test(key)) return;
      buffer.current = (buffer.current + key).toUpperCase().slice(-2);
      const match = LINE_CODES.find((c) => c === buffer.current);
      if (match) {
        buffer.current = '';
        // A typed code is a shortcut into Explore, so backing out of the
        // directions lands on the Line list it skipped past.
        setView('explore');
        setSelected(match);
      }
    },
    [view, lines, resume, chooseLine, toggleSearch, openLeaderboard, openDispatcher, startQuick, openExplore],
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
    <div
      className="home-map"
      data-intro={showIntro ? 'true' : undefined}
      style={
        showIntro
          ? ({ '--intro-delay': `${Math.round(timing.total)}ms` } as React.CSSProperties)
          : undefined
      }
    >
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
        entrance={showIntro ? timing : null}
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

        {selected ? (
          <DirectionChooser
            net={net}
            line={selected}
            onChoose={(from) => onStartLine(selected, from)}
            onCancel={() => setSelected(null)}
          />
        ) : view === 'explore' ? (
          <ExploreList
            net={net}
            visited={visited}
            resumeName={resumeName}
            searching={searching}
            onResume={resume}
            onChooseLine={chooseLine}
            onToggleSearch={toggleSearch}
            onPickStation={onPickStation}
          />
        ) : (
          <>
            <HomeModes
              resumeName={resumeName}
              bestShifts={shiftsBest}
              quickBest={profile.quickBestOverall ?? null}
              visited={visited.size}
              total={net.stations.size}
              onDispatcher={onOpenDispatcher ? openDispatcher : undefined}
              onQuick={onStartQuick ? startQuick : undefined}
              onExplore={openExplore}
              onResume={resume}
            />

            <button type="button" onClick={openLeaderboard}>
              <kbd data-testid="menu-key">4</kbd>
              <span>Leaderboard</span>
            </button>

            <p className="hint">Press a number, or type a line code.</p>
          </>
        )}

        <div className="control-cluster">
          <SoundToggle muted={muted} onToggle={toggleSound} />
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
      </div>

      <footer>
        An unofficial fan project. Not affiliated with Prasarana Malaysia or Rapid KL.
        Station names, codes, and line colours are public information.
      </footer>
      </div>
    </div>
  );
}
