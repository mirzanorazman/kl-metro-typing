import { describe, it, expect } from 'vitest';
import { loadNetworkData } from './load';
import { validateNetworkData } from './validate';
import type { NetworkData } from './types';

describe('validateNetworkData', () => {
  it('reports no errors for the shipped data', () => {
    expect(validateNetworkData(loadNetworkData())).toEqual([]);
  });

  it('catches a station referenced by a line but missing a record', () => {
    const data = loadNetworkData();
    const broken = { ...data, stations: data.stations.filter((s) => s.id !== 'imbi') };
    expect(validateNetworkData(broken).join(' ')).toContain('imbi');
  });

  it('catches a station whose codes disagree with the lines listing it', () => {
    const data = loadNetworkData();
    const stations = data.stations.map((s) =>
      s.id === 'imbi' ? { ...s, codes: {} } : s,
    );
    expect(validateNetworkData({ ...data, stations }).join(' ')).toContain('imbi');
  });

  it('catches two different stations sharing a schematic grid point', () => {
    // Two lines starting at the same point with the same path: a/c and b/d
    // each collide. Nothing else about this dataset is invalid.
    const collided: NetworkData = {
      lines: [
        {
          code: 'MR', name: 'A line', colour: '#000000', termini: ['A', 'B'],
          stations: ['a', 'b'],
          schematic: { start: { x: 0, y: 0 }, segments: [['E', 1]] },
        },
        {
          code: 'KG', name: 'B line', colour: '#000000', termini: ['C', 'D'],
          stations: ['c', 'd'],
          schematic: { start: { x: 0, y: 0 }, segments: [['E', 1]] },
        },
      ],
      stations: [
        { id: 'a', name: 'A', codes: { MR: 'MR1' }, demand: 1, geo: { lat: 3.1, lng: 101.6 } },
        { id: 'b', name: 'B', codes: { MR: 'MR2' }, demand: 1, geo: { lat: 3.1, lng: 101.6 } },
        { id: 'c', name: 'C', codes: { KG: 'KG1' }, demand: 1, geo: { lat: 3.1, lng: 101.6 } },
        { id: 'd', name: 'D', codes: { KG: 'KG2' }, demand: 1, geo: { lat: 3.1, lng: 101.6 } },
      ],
      links: [],
    };
    expect(validateNetworkData(collided).join(' ')).toContain('same schematic point');
  });

  it('catches coordinates outside the Klang Valley', () => {
    const data = loadNetworkData();
    const stations = data.stations.map((s) =>
      s.id === 'imbi' ? { ...s, geo: { lat: 51.5, lng: -0.12 } } : s,
    );
    expect(validateNetworkData({ ...data, stations }).join(' ')).toContain('imbi');
  });
});
