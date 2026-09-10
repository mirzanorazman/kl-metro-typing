import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { MobileAdventureSetup } from './MobileAdventureSetup';
import { MobileShell, type MobileDestination } from './MobileShell';
import { MobileTransit } from './MobileTransit';
import { QuickRunScreen } from './QuickRunScreen';
import { TypingInputProvider } from './TypingInputProvider';
import { usePhoneLayout } from './usePhoneLayout';
import { useVisualViewport, VisualViewportProvider } from './useVisualViewport';

type Screen =
  | { kind: 'home' }
  | { kind: 'adventure-setup' }
  | { kind: 'line'; code: LineCode; from: string }
  | { kind: 'adventure'; at: string }
  | { kind: 'leaderboard' }
  | { kind: 'quick'; code: LineCode; toward: string };

function MobileRunFrame({ children }: { children: JSX.Element }) {
  const { height } = useVisualViewport();

  return (
    <div className="mobile-run-frame" style={{ height: `${height}px` }}>
      {children}
    </div>
  );
}

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
  const [theme, setTheme] = useState<Theme>(() => resolveTheme(loadProfile().theme));
  const [mobileDestination, setMobileDestination] = useState<MobileDestination>('transit');
  const phone = usePhoneLayout();
  const previousPhone = useRef(phone);
  const lastQuickStart = useRef<string | null>(null);

  useEffect(() => {
    if (previousPhone.current === phone) return;
    previousPhone.current = phone;

    if (phone && screen.kind === 'leaderboard') {
      setMobileDestination('ranking');
      setScreen({ kind: 'home' });
    } else if (!phone && screen.kind === 'adventure-setup') {
      setMobileDestination('transit');
      setScreen({ kind: 'home' });
    } else if (!phone && screen.kind === 'home') {
      setMobileDestination('transit');
    }
  }, [phone, screen.kind]);

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

  const startQuick = useCallback((code: LineCode, toward: string) => {
    setScreen({ kind: 'quick', code, toward });
  }, []);

  const onStartingStation = useCallback((stationId: string) => {
    lastQuickStart.current = stationId;
  }, []);

  const navigateMobile = useCallback((destination: MobileDestination) => {
    setMobileDestination(destination);
    setScreen(destination === 'adventure' ? { kind: 'adventure-setup' } : { kind: 'home' });
  }, []);

  const renderHome = () => {
    if (phone) {
      return (
        <MobileShell active={mobileDestination} onNavigate={navigateMobile}>
          {mobileDestination === 'transit' && (
            <MobileTransit
              net={net}
              onStartQuick={(code, toward) => startQuick(code, toward)}
              onStartLine={(code, from) => setScreen({ kind: 'line', code, from })}
            />
          )}
          {mobileDestination === 'adventure' && (
            <MobileAdventureSetup
              net={net}
              onStart={(at) => setScreen({ kind: 'adventure', at })}
            />
          )}
          {mobileDestination === 'ranking' && <LeaderboardScreen net={net} embedded />}
        </MobileShell>
      );
    }

    return (
      <HomeMap
        net={net}
        theme={theme}
        onToggleTheme={toggleTheme}
        onStartLine={(code, from) => setScreen({ kind: 'line', code, from })}
        onStartQuick={startQuick}
        onPickStation={(at) => setScreen({ kind: 'adventure', at })}
        onOpenLeaderboard={() => setScreen({ kind: 'leaderboard' })}
      />
    );
  };

  let content: JSX.Element;

  if (screen.kind === 'line') {
    content = (
      <LineRunScreen
        net={net}
        line={screen.code}
        from={screen.from}
        onExit={home}
      />
    );
  } else if (screen.kind === 'adventure') {
    content = <AdventureScreen net={net} startAt={screen.at} onExit={home} />;
  } else if (screen.kind === 'leaderboard') {
    content = <LeaderboardScreen net={net} onExit={home} />;
  } else if (screen.kind === 'quick') {
    content = (
      <QuickRunScreen
        net={net}
        line={screen.code}
        toward={screen.toward}
        previousStart={lastQuickStart.current}
        onStartingStation={onStartingStation}
        onBack={home}
      />
    );
  } else if (screen.kind === 'adventure-setup') {
    content = (
      <MobileShell active="adventure" onNavigate={navigateMobile}>
        <MobileAdventureSetup
          net={net}
          onStart={(at) => setScreen({ kind: 'adventure', at })}
        />
      </MobileShell>
    );
  } else {
    content = renderHome();
  }

  const activeRun = screen.kind === 'line' || screen.kind === 'adventure' || screen.kind === 'quick';
  const framedContent = phone && activeRun
    ? <MobileRunFrame>{content}</MobileRunFrame>
    : content;

  return (
    <VisualViewportProvider>
      <TypingInputProvider enabled={phone}>{framedContent}</TypingInputProvider>
    </VisualViewportProvider>
  );
}
