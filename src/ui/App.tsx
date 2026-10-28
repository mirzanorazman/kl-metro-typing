import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LineCode } from '../data/types';
import { loadNetworkData } from '../data/load';
import { validateNetworkData } from '../data/validate';
import { buildNetwork } from '../engine/network';
import { loadProfile, saveProfile, type Theme } from '../engine/progress';
import { eligibleQuickLegs, randomQuickRoute } from '../engine/quickRun';
import { setMuted, installAudioUnlock } from '../audio/sound';
import { fullNetworkPeak } from '../render/dispatchReadability';
import { DispatcherScreen } from './DispatcherScreen';
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
import { usePhoneLandscape } from './usePhoneLandscape';
import { useVisualViewport, VisualViewportProvider } from './useVisualViewport';

type Screen =
  | { kind: 'home' }
  | { kind: 'adventure-setup' }
  | { kind: 'line'; code: LineCode; from: string }
  | { kind: 'adventure'; at: string }
  | { kind: 'leaderboard' }
  | { kind: 'quick'; code: LineCode; toward: string; fromCard: boolean }
  | { kind: 'dispatch' };

function MobileRunFrame({ children, phone }: { children: JSX.Element; phone: boolean }) {
  const { height } = useVisualViewport();

  return (
    <div
      className={phone ? 'mobile-run-frame' : undefined}
      style={{ height: phone ? `${height}px` : '100%' }}
    >
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

/**
 * Dev only: `?dispatch=full` opens a Dispatcher Career on the full network at
 * a busy peak, for checking the map's readability in the browser.
 * `&seed=2&flow=90&hold=40` picks the peak's seed and its flowing and held
 * seconds (see `fullNetworkPeak`). Vite
 * replaces `import.meta.env.DEV` with false in a production build, so this
 * and the helper it calls are stripped there.
 */
const devFullDispatch = () =>
  import.meta.env.DEV && new URLSearchParams(window.location.search).get('dispatch') === 'full';

export function App() {
  const data = useMemo(() => loadNetworkData(), []);
  const net = useMemo(() => buildNetwork(data), [data]);
  const [screen, setScreen] = useState<Screen>(() => (devFullDispatch() ? { kind: 'dispatch' } : { kind: 'home' }));
  const devInitial = useMemo(() => {
    if (!devFullDispatch()) return undefined;
    const params = new URLSearchParams(window.location.search);
    const num = (key: string) => (params.has(key) ? Number(params.get(key)) : undefined);
    const secs = (key: string) => (num(key) === undefined ? undefined : num(key)! * 1000);
    return fullNetworkPeak(net, num('seed'), secs('flow'), secs('hold'));
  }, [net]);
  // The map draws itself on when the session opens, and not on the returns
  // from a run or the leaderboard. Owned here rather than in HomeMap because
  // this is where "have we been anywhere yet" is already known: HomeMap
  // unmounts on the way out and could not remember it.
  const [introSpent, setIntroSpent] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => resolveTheme(loadProfile().theme));
  const [mobileDestination, setMobileDestination] = useState<MobileDestination>('transit');
  const phone = usePhoneLayout();
  const phoneLandscape = usePhoneLandscape(phone);
  // Saved callbacks can outlive a setup render; guard them with the current gate.
  const playBlocked = useRef(phoneLandscape);
  playBlocked.current = phoneLandscape;
  const previousPhone = useRef(phone);
  const lastQuickStart = useRef<string | null>(null);
  // Bumped by each random Quick Run so its screen remounts on the new route.
  const [quickRound, setQuickRound] = useState(0);
  // Bumped by "New Career" so the screen remounts with a fresh seed.
  const [career, setCareer] = useState(0);

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

  const leaveHome = (next: Screen) => {
    if (
      playBlocked.current &&
      (next.kind === 'quick' || next.kind === 'line' || next.kind === 'adventure' || next.kind === 'dispatch')
    ) return;
    setIntroSpent(true);
    setScreen(next);
  };

  const startQuick = useCallback((code: LineCode, toward: string, fromCard = false) => {
    if (playBlocked.current || eligibleQuickLegs(net, code, toward).length === 0) return;
    setIntroSpent(true);
    setScreen({ kind: 'quick', code, toward, fromCard });
  }, [net]);

  // The home card's Quick Run: nobody chose a Line, so draw one, and draw
  // again for every "Run again".
  const startRandomQuick = useCallback(() => {
    const route = randomQuickRoute(net, Math.random);
    startQuick(route.line, route.toward, true);
    setQuickRound((n) => n + 1);
  }, [net, startQuick]);

  const startLine = (code: LineCode, from: string) => leaveHome({ kind: 'line', code, from });
  const startAdventure = (at: string) => leaveHome({ kind: 'adventure', at });

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
              phoneLandscape={phoneLandscape}
              onStartQuick={(code, toward) => startQuick(code, toward)}
              onStartLine={startLine}
            />
          )}
          {mobileDestination === 'adventure' && (
            <MobileAdventureSetup
              net={net}
              phoneLandscape={phoneLandscape}
              onStart={startAdventure}
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
        onStartLine={startLine}
        onStartQuick={startQuick}
        onPickStation={startAdventure}
        onOpenLeaderboard={() => leaveHome({ kind: 'leaderboard' })}
        onOpenDispatcher={() => leaveHome({ kind: 'dispatch' })}
        intro={!introSpent}
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
        phoneLandscape={phoneLandscape}
      />
    );
  } else if (screen.kind === 'adventure') {
    content = <AdventureScreen net={net} startAt={screen.at} onExit={home} phoneLandscape={phoneLandscape} />;
  } else if (screen.kind === 'leaderboard') {
    content = <LeaderboardScreen net={net} onExit={home} />;
  } else if (screen.kind === 'quick') {
    content = (
      <QuickRunScreen
        key={quickRound}
        net={net}
        line={screen.code}
        toward={screen.toward}
        previousStart={lastQuickStart.current}
        onStartingStation={onStartingStation}
        onBack={home}
        onAgain={screen.fromCard ? startRandomQuick : undefined}
        phoneLandscape={phoneLandscape}
      />
    );
  } else if (screen.kind === 'dispatch') {
    content = (
      <DispatcherScreen
        key={career}
        net={net}
        initial={career === 0 ? devInitial : undefined}
        onExit={home}
        onAgain={() => setCareer((n) => n + 1)}
        phoneLandscape={phoneLandscape}
      />
    );
  } else if (screen.kind === 'adventure-setup') {
    content = (
      <MobileShell active="adventure" onNavigate={navigateMobile}>
        <MobileAdventureSetup
          net={net}
          phoneLandscape={phoneLandscape}
          onStart={startAdventure}
        />
      </MobileShell>
    );
  } else {
    content = renderHome();
  }

  const activeRun =
    screen.kind === 'line' || screen.kind === 'adventure' || screen.kind === 'quick' || screen.kind === 'dispatch';
  const framedContent = activeRun
    ? <MobileRunFrame phone={phone}>{content}</MobileRunFrame>
    : content;

  return (
    <VisualViewportProvider>
      <TypingInputProvider enabled={phone && !phoneLandscape}>{framedContent}</TypingInputProvider>
    </VisualViewportProvider>
  );
}
