import type { LineCode } from '../data/types';
import type { NetworkIndex } from '../engine/network';
import { LineBadge } from './LineBadge';
import { StationSearch } from './StationSearch';

export interface ExploreListProps {
  net: NetworkIndex;
  visited: Set<string>;
  /** The saved Adventure's Station name, or null when there is none to resume. */
  resumeName: string | null;
  searching: boolean;
  onResume: () => void;
  onChooseLine: (code: LineCode) => void;
  onToggleSearch: () => void;
  onPickStation: (stationId: string) => void;
}

/**
 * The Explore view: Resume on 0, the seven Lines on 1–7 with their visited
 * counts, Start anywhere on 8. Picking a Line opens its direction chooser, a
 * Line Run; Resume and Start anywhere are Adventure.
 */
export function ExploreList({
  net, visited, resumeName, searching, onResume, onChooseLine, onToggleSearch, onPickStation,
}: ExploreListProps) {
  const lines = [...net.lines.values()];
  return (
    <div className="explore-list">
      <div className="mode-card explore-head">
        <h2 className="mode-label">Explore</h2>
        <p className="mode-copy">No clock. Ride a whole line, or roam freely and unlock stations.</p>
      </div>

      {resumeName && (
        <button type="button" onClick={onResume}>
          <kbd data-testid="menu-key">0</kbd>
          <span>Resume from {resumeName}</span>
        </button>
      )}

      <div className="line-list">
        {lines.map((line, i) => {
          const done = line.stations.filter((id) => visited.has(id)).length;
          return (
            <button
              key={line.code}
              type="button"
              style={{ '--line-colour': line.colour } as React.CSSProperties}
              onClick={() => onChooseLine(line.code)}
            >
              <kbd data-testid="menu-key">{i + 1}</kbd>
              <LineBadge code={line.code} colour={line.colour} />
              <span>{line.name}</span>
              <span className="count">{done} / {line.stations.length}</span>
            </button>
          );
        })}
      </div>

      <button type="button" onClick={onToggleSearch}>
        <kbd data-testid="menu-key">{lines.length + 1}</kbd>
        <span>Start anywhere</span>
      </button>

      <p className="hint">
        <kbd>Esc</kbd> {searching ? 'to close the search.' : 'to go back.'}
      </p>
      {searching && <StationSearch net={net} onPick={onPickStation} />}
    </div>
  );
}
