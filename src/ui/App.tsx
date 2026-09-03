import { useMemo, useState } from 'react';
import { loadNetworkData } from '../data/load';
import { validateNetworkData } from '../data/validate';
import { buildNetwork } from '../engine/network';
import { HomeScreen } from './HomeScreen';
import { AdventureScreen } from './AdventureScreen';

export function App() {
  const data = useMemo(() => loadNetworkData(), []);
  const net = useMemo(() => buildNetwork(data), [data]);
  const [startAt, setStartAt] = useState<string | null>(null);

  // Data is validated by the test suite; this is a developer safety net only.
  if (import.meta.env.DEV) {
    const errors = validateNetworkData(data);
    if (errors.length > 0) console.error('network data errors:', errors);
  }

  return startAt === null ? (
    <HomeScreen net={net} onStart={setStartAt} />
  ) : (
    <AdventureScreen net={net} startAt={startAt} onExit={() => setStartAt(null)} />
  );
}
