import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { emptyProfile, saveProfile } from '../engine/progress';
import { HomeScreen } from './HomeScreen';

const net = buildNetwork(loadNetworkData());
beforeEach(() => localStorage.clear());

describe('HomeScreen', () => {
  it('lists all seven lines with progress', () => {
    render(<HomeScreen net={net} onStart={() => {}} />);
    expect(screen.getAllByRole('progressbar')).toHaveLength(7);
  });

  it('shows overall station progress', () => {
    render(<HomeScreen net={net} onStart={() => {}} />);
    expect(screen.getByText(/0 \/ \d+ stations visited/)).toBeTruthy();
  });

  it('offers to resume a saved journey', () => {
    saveProfile({ ...emptyProfile(), adventure: { at: 'imbi', arrivedFrom: null, line: null } });
    render(<HomeScreen net={net} onStart={() => {}} />);
    expect(screen.getByRole('button', { name: /resume/i })).toBeTruthy();
  });

  it('states that the project is unofficial', () => {
    render(<HomeScreen net={net} onStart={() => {}} />);
    expect(screen.getByText(/not affiliated/i)).toBeTruthy();
  });
});
