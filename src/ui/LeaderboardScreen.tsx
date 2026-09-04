import { useState } from 'react';
import { LINE_CODES, type LineCode } from '../data/types';
import { lineAt, type NetworkIndex } from '../engine/network';
import type { LeaderboardEntry } from '../engine/leaderboard';
import { loadStore, type LeaderboardStore } from '../data/leaderboardStore';
import './leaderboard.css';

export interface LeaderboardScreenProps {
  net: NetworkIndex;
  onExit: () => void;
}

type Tab = 'overall' | LineCode;

export function LeaderboardScreen({ net, onExit }: LeaderboardScreenProps) {
  const [store] = useState<LeaderboardStore>(() => loadStore());
  const [tab, setTab] = useState<Tab>('overall');

  const entries: LeaderboardEntry[] = tab === 'overall' ? store.overall : store.perLine[tab];

  return (
    <div className="leaderboard-screen">
      <h2>Leaderboard</h2>

      <div className="leaderboard-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'overall'} onClick={() => setTab('overall')}>
          Overall
        </button>
        {LINE_CODES.map((code) => (
          <button key={code} type="button" role="tab" aria-selected={tab === code} onClick={() => setTab(code)}>
            {code}
          </button>
        ))}
      </div>

      {entries.length === 0 ? (
        <p>No scores yet — be the first.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              {tab === 'overall' && <th>Line</th>}
              <th>{tab === 'overall' ? 'Weighted' : 'Score'}</th>
              <th>WPM</th>
              <th>Accuracy</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => (
              <tr key={entry.id}>
                <td>{i + 1}</td>
                <td>{entry.name}</td>
                {tab === 'overall' && <td>{lineAt(net, entry.lineCode)?.name ?? entry.lineCode}</td>}
                <td>{Math.round(tab === 'overall' ? entry.weightedScore : entry.score)}</td>
                <td>{Math.round(entry.wpm)}</td>
                <td>{Math.round(entry.accuracy * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <button type="button" onClick={onExit}>Back to the map</button>
    </div>
  );
}
