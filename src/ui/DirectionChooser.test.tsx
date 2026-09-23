import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { sound } from '../audio/sound';
import { DirectionChooser } from './DirectionChooser';

const net = buildNetwork(loadNetworkData());
afterEach(() => {
  vi.restoreAllMocks();
});

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
    const select = vi.spyOn(sound, 'select').mockImplementation(() => {});
    render(<DirectionChooser net={net} line="MR" onChoose={(id) => (from = id)} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /start at titiwangsa/i }));
    expect(from).toBe('titiwangsa');
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('renders no quick-run actions without a quick callback', () => {
    render(<DirectionChooser net={net} line="MR" onChoose={() => {}} onCancel={() => {}} />);

    expect(screen.queryByRole('button', { name: '30s Quick Run' })).toBeNull();
  });

  it('offers one compact quick-run action per direction', () => {
    const onQuick = vi.fn();
    render(
      <DirectionChooser
        net={net}
        line="MR"
        onChoose={() => {}}
        onQuick={onQuick}
        onCancel={() => {}}
      />,
    );

    const quickActions = [
      screen.getByRole('button', { name: '30s Quick Run toward Titiwangsa' }),
      screen.getByRole('button', { name: '30s Quick Run toward KL Sentral' }),
    ];

    fireEvent.click(quickActions[0]!);

    expect(onQuick).toHaveBeenCalledWith('titiwangsa');
  });

  it('cancels on Escape', () => {
    let cancelled = false;
    render(<DirectionChooser net={net} line="MR" onChoose={() => {}} onCancel={() => (cancelled = true)} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(cancelled).toBe(true);
  });
});
