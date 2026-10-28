import type { ReactNode } from 'react';

export interface HomeModesProps {
  /** The saved Adventure's Station name, or null when there is none to resume. */
  resumeName: string | null;
  bestShifts: number | null;
  quickBest: number | null;
  visited: number;
  total: number;
  onDispatcher?: () => void;
  onQuick?: () => void;
  onExplore: () => void;
  onResume: () => void;
}

/**
 * The home panel's first view: one card per kind of play, so a first-timer
 * sees what the game offers before any list of Lines. Keys 0–3 are printed
 * here; HomeMap owns the listener, as it does for every menu key.
 */
export function HomeModes({
  resumeName, bestShifts, quickBest, visited, total, onDispatcher, onQuick, onExplore, onResume,
}: HomeModesProps) {
  return (
    <div className="home-modes">
      {onDispatcher && (
        <ModeSection label="Career" emphasis>
          <ModeButton
            k="1"
            title="Dispatcher"
            chip={bestShifts === null ? null : `Best · ${bestShifts} ${bestShifts === 1 ? 'Shift' : 'Shifts'}`}
            copy="Your first day in the control room. Keep the trains moving, fix faults before stations shut, and earn new lines one Shift at a time."
            onClick={onDispatcher}
          />
        </ModeSection>
      )}

      {onQuick && (
        <ModeSection label="Challenge">
          <ModeButton
            k="2"
            title="Quick Run"
            chip={quickBest === null ? null : `Best · ${Math.round(quickBest)}`}
            copy="30 seconds against the clock. How fast are you today?"
            onClick={onQuick}
          />
        </ModeSection>
      )}

      <ModeSection label="Explore">
        <ModeButton
          k="3"
          title="Line Run & Adventure"
          chip={`${visited} / ${total}`}
          copy="No clock. Ride a whole line, or roam freely and unlock stations."
          onClick={onExplore}
        />
        {resumeName && (
          <button type="button" className="mode-resume" onClick={onResume}>
            <kbd data-testid="menu-key">0</kbd>
            <span>Resume Adventure from {resumeName}</span>
          </button>
        )}
      </ModeSection>
    </div>
  );
}

function ModeSection({ label, emphasis = false, children }: { label: string; emphasis?: boolean; children: ReactNode }) {
  return (
    // The label sits inside the card: floated over the map it would cross
    // the drawn lines and lose its contrast.
    <section className="mode-card" data-emphasis={emphasis ? 'true' : undefined}>
      <p className="mode-label">{label}</p>
      {children}
    </section>
  );
}

function ModeButton({ k, title, chip, copy, onClick }: {
  k: string;
  title: string;
  chip: string | null;
  copy: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="mode-main" onClick={onClick}>
      <kbd data-testid="menu-key">{k}</kbd>
      <span className="mode-title">{title}</span>
      {chip && <span className="mode-chip">{chip}</span>}
      <span className="mode-copy">{copy}</span>
    </button>
  );
}
