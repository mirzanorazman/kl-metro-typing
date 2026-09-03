import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { searchStations, StationSearch } from './StationSearch';

const net = buildNetwork(loadNetworkData());

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
    render(<StationSearch net={net} onPick={(id) => (chosen = id)} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'imbi' } });
    fireEvent.click(screen.getByRole('button', { name: /imbi/i }));
    expect(chosen).toBe('imbi');
  });
});
