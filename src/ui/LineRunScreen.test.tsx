import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { loadProfile } from '../engine/progress';
import { LineRunScreen } from './LineRunScreen';

const net = buildNetwork(loadNetworkData());
const type = (t: string) => { for (const ch of t) fireEvent.keyDown(window, { key: ch }); };

const MR_ROUTE_FROM_KL_SENTRAL = [
  'KL Sentral', 'Tun Sambanthan', 'Maharajalela', 'Hang Tuah', 'Imbi',
  'Bukit Bintang', 'Raja Chulan', 'Bukit Nanas', 'Medan Tuanku', 'Chow Kit', 'Titiwangsa',
];

beforeEach(() => {
  localStorage.clear();
  // Skips the 1.1s post-completion celebration delay so completion tests
  // don't need real timers.
  window.matchMedia = ((q: string) => ({
    matches: true, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

describe('LineRunScreen', () => {
  it('starts at the chosen terminus', () => {
    render(<LineRunScreen net={net} line="MR" from="kl-sentral" onExit={() => {}} />);
    expect(screen.getByLabelText('Type KL Sentral')).toBeTruthy();
  });

  it('advances along the line without asking for a direction', () => {
    render(<LineRunScreen net={net} line="MR" from="kl-sentral" onExit={() => {}} />);
    type('KL Sentral');
    expect(screen.getByLabelText('Type Tun Sambanthan')).toBeTruthy();
    expect(screen.queryByRole('group', { name: /choose a direction/i })).toBeNull();
  });

  it('persists each visited station', () => {
    render(<LineRunScreen net={net} line="MR" from="kl-sentral" onExit={() => {}} />);
    type('KL Sentral');
    expect(loadProfile().visited).toContain('kl-sentral');
  });

  it('does not write an adventure resume position', () => {
    render(<LineRunScreen net={net} line="MR" from="kl-sentral" onExit={() => {}} />);
    type('KL Sentral');
    expect(loadProfile().adventure).toBeNull();
  });

  describe('leaderboard', () => {
    it('invites the player to the leaderboard after completing the whole line', () => {
      render(<LineRunScreen net={net} line="MR" from="kl-sentral" onExit={() => {}} />);
      for (const name of MR_ROUTE_FROM_KL_SENTRAL) type(name);
      expect(screen.getByLabelText(/your name/i)).toBeTruthy();
    });

    it('does not invite the player when the run ends early', () => {
      render(<LineRunScreen net={net} line="MR" from="kl-sentral" onExit={() => {}} />);
      type('KL Sentral');
      fireEvent.click(screen.getByRole('button', { name: /end run/i }));
      expect(screen.queryByLabelText(/your name/i)).toBeNull();
    });
  });
});
