import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { loadProfile } from '../engine/progress';
import { AdventureScreen } from './AdventureScreen';

const net = buildNetwork(loadNetworkData());
const type = (text: string) => {
  for (const ch of text) fireEvent.keyDown(window, { key: ch });
};

beforeEach(() => localStorage.clear());

describe('AdventureScreen', () => {
  it('shows the start station name to type', () => {
    render(<AdventureScreen net={net} startAt="imbi" onExit={() => {}} />);
    expect(screen.getByLabelText('Type Imbi')).toBeTruthy();
  });

  it('opens the junction picker once the name is typed', () => {
    render(<AdventureScreen net={net} startAt="imbi" onExit={() => {}} />);
    type('Imbi');
    expect(screen.getByRole('group', { name: /choose a direction/i })).toBeTruthy();
  });

  it('persists the visited station', () => {
    render(<AdventureScreen net={net} startAt="imbi" onExit={() => {}} />);
    type('Imbi');
    expect(loadProfile().visited).toContain('imbi');
  });
});
