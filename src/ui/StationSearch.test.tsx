import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { sound } from '../audio/sound';
import { searchStations, StationSearch } from './StationSearch';

const net = buildNetwork(loadNetworkData());
afterEach(() => {
  vi.restoreAllMocks();
});

describe('searchStations', () => {
  it('matches on a name prefix', () => {
    expect(searchStations(net, 'imbi').map((s) => s.id)).toContain('imbi');
  });

  it('is case-insensitive', () => {
    expect(searchStations(net, 'IMBI').map((s) => s.id)).toContain('imbi');
  });

  it('matches on a station code', () => {
    const jamek = net.stations.get('masjid-jamek')!;
    const code = Object.values(jamek.codes)[0]!;
    expect(searchStations(net, code).map((s) => s.id)).toContain('masjid-jamek');
  });

  it('returns nothing for an empty query', () => {
    expect(searchStations(net, '  ')).toEqual([]);
  });

  it('ranks a prefix match above a mid-word match', () => {
    const results = searchStations(net, 'taman');
    expect(results[0]!.name.toLowerCase().startsWith('taman')).toBe(true);
  });
});

describe('StationSearch', () => {
  it('calls back with the chosen station', () => {
    let chosen = '';
    const select = vi.spyOn(sound, 'select').mockImplementation(() => {});
    render(<StationSearch net={net} onPick={(id) => (chosen = id)} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'imbi' } });
    fireEvent.click(screen.getByRole('button', { name: /imbi/i }));
    expect(chosen).toBe('imbi');
    expect(select).toHaveBeenCalledTimes(1);
  });
});

describe('StationSearch suggestion', () => {
  it('lists the suggested Station while the search is empty, and Enter picks it', () => {
    const onPick = vi.fn();
    render(<StationSearch net={net} onPick={onPick} suggested="masjid-jamek" />);
    expect(screen.getByRole('button', { name: /Masjid Jamek/ })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Search stations' }), { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith('masjid-jamek');
  });

  it('does nothing on Enter without a suggestion', () => {
    const onPick = vi.fn();
    render(<StationSearch net={net} onPick={onPick} />);
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Search stations' }), { key: 'Enter' });
    expect(onPick).not.toHaveBeenCalled();
  });

  it('marks the suggested row so it stands out', () => {
    render(<StationSearch net={net} onPick={() => {}} suggested="masjid-jamek" />);
    expect(screen.getByRole('button', { name: /Masjid Jamek/ }).getAttribute('data-suggested')).toBe(
      'true',
    );
  });

  it('never marks a row as suggested when no suggestion is passed', () => {
    render(<StationSearch net={net} onPick={() => {}} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Search stations' }), {
      target: { value: 'masjid' },
    });
    for (const button of screen.getAllByRole('button')) {
      expect(button.getAttribute('data-suggested')).toBeNull();
    }
  });
});
