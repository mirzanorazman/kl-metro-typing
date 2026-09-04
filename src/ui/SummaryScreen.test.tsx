import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { startRun, keyRun, endRun } from '../engine/run';
import { music, sound } from '../audio/sound';
import { SummaryScreen } from './SummaryScreen';

const net = buildNetwork(loadNetworkData());
const finished = endRun(
  [...'Imbi'].reduce((s, k, i) => keyRun(net, s, k, i * 100), startRun(net, 'imbi', 0)),
);
afterEach(() => {
  vi.restoreAllMocks();
});

describe('SummaryScreen', () => {
  it('reports how many stations were visited', () => {
    render(<SummaryScreen net={net} run={finished} onExit={() => {}} />);
    expect(screen.getByText(/1 station/i)).toBeTruthy();
  });

  it('names the fastest and slowest stations of the run', () => {
    render(<SummaryScreen net={net} run={finished} onExit={() => {}} />);
    expect(screen.getAllByText(/Imbi/).length).toBeGreaterThan(0);
  });

  it('handles a run that ended before any station was completed', () => {
    render(<SummaryScreen net={net} run={endRun(startRun(net, 'imbi', 0))} onExit={() => {}} />);
    expect(screen.getByText(/0 stations/i)).toBeTruthy();
  });

  it('draws the journey travelled', () => {
    const { container } = render(<SummaryScreen net={net} run={finished} onExit={() => {}} />);
    expect(container.querySelector('polyline[data-journey]')).toBeTruthy();
  });

  it('renders no shape when no station was completed', () => {
    const { container } = render(
      <SummaryScreen net={net} run={endRun(startRun(net, 'imbi', 0))} onExit={() => {}} />,
    );
    expect(container.querySelector('polyline[data-journey]')).toBeNull();
  });

  it('starts and stops menu music with the summary lifecycle', () => {
    const startMenu = vi.spyOn(music, 'startMenu').mockImplementation(() => {});
    const stopMenu = vi.spyOn(music, 'stopMenu').mockImplementation(() => {});

    const { unmount } = render(<SummaryScreen net={net} run={finished} onExit={() => {}} />);

    expect(startMenu).toHaveBeenCalledTimes(1);

    unmount();
    expect(stopMenu).toHaveBeenCalledTimes(1);
  });

  it('plays a transition sound when returning to the map', () => {
    const onExit = vi.fn();
    const back = vi.spyOn(sound, 'back').mockImplementation(() => {});

    render(<SummaryScreen net={net} run={finished} onExit={onExit} />);
    fireEvent.click(screen.getByRole('button', { name: /back to the map/i }));

    expect(back).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
