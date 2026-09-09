import { useEffect, useMemo, useState } from 'react';
import type { LineCode } from '../data/types';
import { loadNetworkData } from '../data/load';
import { validateNetworkData } from '../data/validate';
import { buildNetwork } from '../engine/network';
import { loadProfile, saveProfile, type Theme } from '../engine/progress';
import { setMuted, installAudioUnlock } from '../audio/sound';
import { HomeMap } from './HomeMap';
import { LineRunScreen } from './LineRunScreen';
import { AdventureScreen } from './AdventureScreen';
import { LeaderboardScreen } from './LeaderboardScreen';

type Screen =
  | { kind: 'home' }
  | { kind: 'line'; code: LineCode; from: string }
  | { kind: 'adventure'; at: string }
  | { kind: 'leaderboard' };

/**
 * The atmosphere to render in. A stored choice always wins; with none, the OS
 * decides and nothing is written — a player who never touches the toggle keeps
 * following their system for as long as they never touch it.
 */
function resolveTheme(stored: Theme | undefined): Theme {
  if (stored) return stored;
  const dark =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return dark ? 'midnight' : 'paper';
}

export function App() {
  const data = useMemo(() => loadNetworkData(), []);
  const net = useMemo(() => buildNetwork(data), [data]);
  const [screen, setScreen] = useState<Screen>({ kind: 'home' });
  // The map draws itself on when the session opens, and not on the returns
  // from a run or the leaderboard. Owned here rather than in HomeMap because
  // this is where "have we been anywhere yet" is already known: HomeMap
  // unmounts on the way out and could not remember it.
  const [introSpent, setIntroSpent] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => resolveTheme(loadProfile().theme));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggleTheme = () => {
    const next: Theme = theme === 'midnight' ? 'paper' : 'midnight';
    setTheme(next);
    saveProfile({ ...loadProfile(), theme: next });
  };

  // Apply the stored sound preference once, before anything can play.
  useState(() => {
    setMuted(loadProfile().muted);
    installAudioUnlock();
  });

  // Data is validated by the test suite; this is a developer safety net only.
  if (import.meta.env.DEV) {
    const errors = validateNetworkData(data);
    if (errors.length > 0) console.error('network data errors:', errors);
  }

  const home = () => setScreen({ kind: 'home' });

  const leaveHome = (next: Screen) => {
    setIntroSpent(true);
    setScreen(next);
  };

  if (screen.kind === 'line') {
    return (
      <LineRunScreen net={net} line={screen.code} from={screen.from} onExit={home} />
    );
  }
  if (screen.kind === 'adventure') {
    return <AdventureScreen net={net} startAt={screen.at} onExit={home} />;
  }
  if (screen.kind === 'leaderboard') {
    return <LeaderboardScreen net={net} onExit={home} />;
  }
  return (
    <HomeMap
      net={net}
      theme={theme}
      onToggleTheme={toggleTheme}
      onStartLine={(code, from) => leaveHome({ kind: 'line', code, from })}
      onPickStation={(at) => leaveHome({ kind: 'adventure', at })}
      onOpenLeaderboard={() => leaveHome({ kind: 'leaderboard' })}
      intro={!introSpent}
    />
  );
}
