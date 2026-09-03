import { describe, it, expect } from 'vitest';
import { loadNetworkData } from './load';

describe('loadNetworkData', () => {
  it('loads all seven lines', () => {
    const data = loadNetworkData();
    expect(data.lines).toHaveLength(7);
  });

  it('gives every line at least two stations', () => {
    for (const line of loadNetworkData().lines) {
      expect(line.stations.length).toBeGreaterThan(1);
    }
  });

  it('has a station record for every referenced id', () => {
    const data = loadNetworkData();
    const ids = new Set(data.stations.map((s) => s.id));
    for (const line of data.lines) {
      for (const id of line.stations) expect(ids.has(id)).toBe(true);
    }
  });
});
