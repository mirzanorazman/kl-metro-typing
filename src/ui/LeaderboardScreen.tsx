import { useState } from 'react';
import { LINE_CODES, type LineCode } from '../data/types';
import { lineAt, type NetworkIndex } from '../engine/network';
import type { LeaderboardEntry } from '../engine/leaderboard';
import { loadStore, type LeaderboardStore } from '../data/leaderboardStore';
import { loadDispatchBoard, type DispatchBoard } from '../data/dispatchBoardStore';
import { LineBadge } from './LineBadge';
import './leaderboard.css';

export interface LeaderboardScreenProps {
  net: NetworkIndex;
  onExit?: () => void;
  embedded?: boolean;
}

type Tab = 'overall' | LineCode | 'dispatcher';

/** Dispatcher Careers: one board, ranked by Career score. */
function DispatchTable({ board }: { board: DispatchBoard }) {
  if (board.entries.length === 0) return <p>No Careers yet — be the first.</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Name</th>
          <th>Score</th>
          <th>Shifts</th>
          <th>WPM</th>
          <th>Accuracy</th>
        </tr>
      </thead>
      <tbody>
        {board.entries.map((entry, i) => (
          <tr key={entry.id}>
            <td>{i + 1}</td>
            <td>{entry.name}</td>
            <td>{Math.round(entry.score)}</td>
            <td>{entry.shifts}</td>
            <td>{Math.round(entry.wpm)}</td>
            <td>{Math.round(entry.accuracy * 100)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function LeaderboardScreen({ net, onExit, embedded = false }: LeaderboardScreenProps) {
  const [store] = useState<LeaderboardStore>(() => loadStore());
  const [dispatchBoard] = useState<DispatchBoard>(() => loadDispatchBoard());
  const [tab, setTab] = useState<Tab>('overall');

  const entries: LeaderboardEntry[] = tab === 'overall' ? store.overall : tab === 'dispatcher' ? [] : store.perLine[tab];

  return (
    <div className={`leaderboard-screen${embedded ? ' leaderboard-screen--embedded' : ''}`}>
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
        <button type="button" role="tab" aria-selected={tab === 'dispatcher'} onClick={() => setTab('dispatcher')}>
          Dispatcher
        </button>
      </div>

      {tab === 'dispatcher' ? (
        <DispatchTable board={dispatchBoard} />
      ) : entries.length === 0 ? (
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
                {tab === 'overall' && (
                  <td>
                    {(() => {
                      const def = lineAt(net, entry.lineCode);
                      return def ? (
                        <>
                          <LineBadge code={entry.lineCode} colour={def.colour} /> {def.name}
                        </>
                      ) : (
                        entry.lineCode
                      );
                    })()}
                  </td>
                )}
                <td>{Math.round(tab === 'overall' ? entry.weightedScore : entry.score)}</td>
                <td>{Math.round(entry.wpm)}</td>
                <td>{Math.round(entry.accuracy * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!embedded && <button type="button" onClick={onExit}>Back to the map</button>}
    </div>
  );
}
