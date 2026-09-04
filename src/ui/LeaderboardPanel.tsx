import { useState } from 'react';
import type { Qualification } from '../data/leaderboardStore';
import './leaderboard.css';

export interface LeaderboardPanelProps {
  qualification: Qualification;
  score: number;
  lineName: string;
  knownNames: string[];
  onSubmit: (name: string) => { overallRank: number | null; lineRank: number | null };
}

export function LeaderboardPanel({
  qualification, score, lineName, knownNames, onSubmit,
}: LeaderboardPanelProps) {
  const [name, setName] = useState('');
  const [result, setResult] = useState<{ overallRank: number | null; lineRank: number | null } | null>(null);

  if (result) {
    return (
      <div className="leaderboard-panel" role="status">
        {result.lineRank !== null && <p>New {lineName} line record — #{result.lineRank}!</p>}
        {result.overallRank !== null && <p>#{result.overallRank} overall!</p>}
      </div>
    );
  }

  const qualifies = qualification.overallQualifies || qualification.lineQualifies;

  if (!qualifies) {
    return (
      <div className="leaderboard-panel">
        <p>Didn't make the leaderboard this time.</p>
        {qualification.lineCutoff !== null && (
          <p>
            {lineName} line needs {Math.floor(qualification.lineCutoff) + 1}+ — you got {Math.floor(score)}.
          </p>
        )}
        {qualification.overallCutoff !== null && (
          <p>
            Overall needs {Math.floor(qualification.overallCutoff) + 1}+ (weighted) — you got{' '}
            {Math.floor(qualification.weightedScore)}.
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      className="leaderboard-panel"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;
        setResult(onSubmit(trimmed));
      }}
    >
      <p>You made the leaderboard! Enter a name:</p>
      <input
        list="leaderboard-known-names"
        value={name}
        maxLength={24}
        required
        onChange={(e) => setName(e.target.value)}
        aria-label="Your name"
      />
      <datalist id="leaderboard-known-names">
        {knownNames.map((n) => <option key={n} value={n} />)}
      </datalist>
      <button type="submit">Save score</button>
    </form>
  );
}
