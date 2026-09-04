import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { DirectionChooser } from './DirectionChooser';

const net = buildNetwork(loadNetworkData());

describe('DirectionChooser', () => {
  it('offers both termini of the line', () => {
    render(<DirectionChooser net={net} line="MR" onChoose={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole('button', { name: /start at kl sentral/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /start at titiwangsa/i })).toBeTruthy();
  });

  it('reports the terminus chosen by number key', () => {
    let from = '';
    render(<DirectionChooser net={net} line="MR" onChoose={(id) => (from = id)} onCancel={() => {}} />);
    fireEvent.keyDown(window, { key: '1' });
    expect(from).toBe('kl-sentral');
  });

  it('reports the terminus chosen by click', () => {
    let from = '';
    render(<DirectionChooser net={net} line="MR" onChoose={(id) => (from = id)} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /start at titiwangsa/i }));
    expect(from).toBe('titiwangsa');
  });

  it('cancels on Escape', () => {
    let cancelled = false;
    render(<DirectionChooser net={net} line="MR" onChoose={() => {}} onCancel={() => (cancelled = true)} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(cancelled).toBe(true);
  });
});
