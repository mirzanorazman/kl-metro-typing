import { useMemo, useState } from 'react';
import type { LineCode } from '../data/types';
import { loadNetworkData } from '../data/load';
import { validateNetworkData } from '../data/validate';
import { buildNetwork } from '../engine/network';
import { loadProfile } from '../engine/progress';
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

export function App() {
  const data = useMemo(() => loadNetworkData(), []);
  const net = useMemo(() => buildNetwork(data), [data]);
  const [screen, setScreen] = useState<Screen>({ kind: 'home' });

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
      onStartLine={(code, from) => setScreen({ kind: 'line', code, from })}
      onPickStation={(at) => setScreen({ kind: 'adventure', at })}
      onOpenLeaderboard={() => setScreen({ kind: 'leaderboard' })}
    />
  );
}
