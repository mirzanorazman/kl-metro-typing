import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { App } from './App';

const type = (t: string) => { for (const ch of t) fireEvent.keyDown(window, { key: ch }); };

const MR_ROUTE_FROM_KL_SENTRAL = [
  'KL Sentral', 'Tun Sambanthan', 'Maharajalela', 'Hang Tuah', 'Imbi',
  'Bukit Bintang', 'Raja Chulan', 'Bukit Nanas', 'Medan Tuanku', 'Chow Kit', 'Titiwangsa',
];

beforeEach(() => localStorage.clear());

describe('App', () => {
  it('opens on the map', () => {
    const { container } = render(<App />);
    expect(container.querySelectorAll('polyline[data-line]')).toHaveLength(7);
  });

  it('starts a line run from the map', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /kl monorail/i }));
    fireEvent.keyDown(window, { key: '1' });
    expect(screen.getByLabelText('Type KL Sentral')).toBeTruthy();
  });

  it('starts an adventure from a searched station', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /start anywhere/i }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'imbi' } });
    fireEvent.click(screen.getByRole('button', { name: /^imbi/i }));
    expect(screen.getByLabelText('Type Imbi')).toBeTruthy();
  });

  it('opens the leaderboard from the map', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /leaderboard/i }));
    expect(screen.getByRole('heading', { name: /leaderboard/i })).toBeTruthy();
  });

  it('takes a completed line run all the way to a visible leaderboard entry', () => {
    // Skips the 1.1s post-completion celebration delay so the summary (and
    // its leaderboard panel) appears synchronously — see LineRunScreen.test.tsx.
    window.matchMedia = ((q: string) => ({
      matches: true, media: q, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /kl monorail/i }));
    fireEvent.keyDown(window, { key: '1' });

    for (const name of MR_ROUTE_FROM_KL_SENTRAL) type(name);

    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Ali' } });
    fireEvent.click(screen.getByRole('button', { name: /save score/i }));

    fireEvent.click(screen.getByRole('button', { name: /back to the map/i }));
    fireEvent.click(screen.getByRole('button', { name: /leaderboard/i }));

    expect(screen.getByText('Ali')).toBeTruthy();
  });
});
