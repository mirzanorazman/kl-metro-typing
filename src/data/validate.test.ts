import { describe, it, expect } from 'vitest';
import { loadNetworkData } from './load';
import { validateNetworkData } from './validate';

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

  it('catches coordinates outside the Klang Valley', () => {
    const data = loadNetworkData();
    const stations = data.stations.map((s) =>
      s.id === 'imbi' ? { ...s, geo: { lat: 51.5, lng: -0.12 } } : s,
    );
    expect(validateNetworkData({ ...data, stations }).join(' ')).toContain('imbi');
  });
});
