import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { loadProfile } from '../engine/progress';
import { LineRunScreen } from './LineRunScreen';

const net = buildNetwork(loadNetworkData());
const type = (t: string) => { for (const ch of t) fireEvent.keyDown(window, { key: ch }); };
beforeEach(() => localStorage.clear());

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
});
