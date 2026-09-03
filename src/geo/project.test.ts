import { describe, it, expect } from 'vitest';
import { loadNetworkData } from '../data/load';
import { projectStations } from './project';

const vp = { width: 1000, height: 800, padding: 40 };
const pts = projectStations(loadNetworkData().stations, vp);

describe('projectStations', () => {
  it('projects every station', () => {
    expect(pts.size).toBe(loadNetworkData().stations.length);
  });

  it('keeps every point inside the padded viewport', () => {
    for (const p of pts.values()) {
      expect(p.x).toBeGreaterThanOrEqual(vp.padding - 0.001);
      expect(p.x).toBeLessThanOrEqual(vp.width - vp.padding + 0.001);
      expect(p.y).toBeGreaterThanOrEqual(vp.padding - 0.001);
      expect(p.y).toBeLessThanOrEqual(vp.height - vp.padding + 0.001);
    }
  });

  it('puts a northern station above a southern one', () => {
    const gombak = pts.get('gombak')!;
    const putrajaya = pts.get('putrajaya-sentral')!;
    expect(gombak.y).toBeLessThan(putrajaya.y);
  });

  it('puts an eastern station right of a western one', () => {
    expect(pts.get('ampang')!.x).toBeGreaterThan(pts.get('johan-setia')!.x);
  });
});
