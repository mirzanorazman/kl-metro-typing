import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Qualification } from '../data/leaderboardStore';
import { LeaderboardPanel } from './LeaderboardPanel';

const qualifying: Qualification = {
  weight: 0.5,
  weightedScore: 30,
  overallQualifies: true,
  lineQualifies: true,
  overallCutoff: null,
  lineCutoff: null,
};

const notQualifying: Qualification = {
  weight: 0.5,
  weightedScore: 10,
  overallQualifies: false,
  lineQualifies: false,
  overallCutoff: 40,
  lineCutoff: 80,
};

describe('LeaderboardPanel', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('runs the track round the box whether it missed, asks for a name or shows the ranks', () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(160);
    const track = () => document.querySelector('.leaderboard-panel > svg.leaderboard-track .leaderboard-track-train');
    const panel = (qualification: Qualification) => (
      <LeaderboardPanel
        qualification={qualification}
        score={60}
        lineName="KL Monorail"
        knownNames={[]}
        onSubmit={() => ({ overallRank: 4, lineRank: 2 })}
      />
    );

    const missed = render(panel(notQualifying));
    expect(track()).not.toBeNull();
    missed.unmount();

    render(panel(qualifying));
    expect(track()).not.toBeNull();
    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Ali' } });
    fireEvent.click(screen.getByRole('button', { name: /save score/i }));
    expect(screen.getByText(/#4 overall/i)).toBeTruthy();
    expect(track()).not.toBeNull();
  });

  it('shows the miss message with cutoff numbers when neither board qualifies', () => {
    render(
      <LeaderboardPanel
        qualification={notQualifying}
        score={20}
        lineName="KL Monorail"
        knownNames={[]}
        onSubmit={() => ({ overallRank: null, lineRank: null })}
      />,
    );
    expect(screen.getByText(/didn't make the leaderboard/i)).toBeTruthy();
    expect(screen.getByText(/needs 81\+/i)).toBeTruthy();
    expect(screen.getByText(/needs 41\+/i)).toBeTruthy();
  });

  it('offers a name form when a board qualifies', () => {
    render(
      <LeaderboardPanel
        qualification={qualifying}
        score={60}
        lineName="KL Monorail"
        knownNames={['Ali']}
        onSubmit={() => ({ overallRank: 1, lineRank: 1 })}
      />,
    );
    expect(screen.getByLabelText(/your name/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /save score/i })).toBeTruthy();
  });

  it('lists known names for autocomplete', () => {
    const { container } = render(
      <LeaderboardPanel
        qualification={qualifying}
        score={60}
        lineName="KL Monorail"
        knownNames={['Ali', 'Bee']}
        onSubmit={() => ({ overallRank: 1, lineRank: 1 })}
      />,
    );
    expect(container.querySelectorAll('datalist option')).toHaveLength(2);
  });

  it('submits the trimmed name and shows the ranks achieved', () => {
    let submitted = '';
    render(
      <LeaderboardPanel
        qualification={qualifying}
        score={60}
        lineName="KL Monorail"
        knownNames={[]}
        onSubmit={(name) => {
          submitted = name;
          return { overallRank: 4, lineRank: 2 };
        }}
      />,
    );
    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: '  Ali  ' } });
    fireEvent.click(screen.getByRole('button', { name: /save score/i }));

    expect(submitted).toBe('Ali');
    expect(screen.getByText(/new kl monorail line record — #2/i)).toBeTruthy();
    expect(screen.getByText(/#4 overall/i)).toBeTruthy();
  });

  it('only reports the board it actually landed on', () => {
    render(
      <LeaderboardPanel
        qualification={qualifying}
        score={60}
        lineName="KL Monorail"
        knownNames={[]}
        onSubmit={() => ({ overallRank: null, lineRank: 5 })}
      />,
    );
    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Ali' } });
    fireEvent.click(screen.getByRole('button', { name: /save score/i }));

    expect(screen.getByText(/new kl monorail line record — #5/i)).toBeTruthy();
    expect(screen.queryByText(/overall/i)).toBeNull();
  });
});
