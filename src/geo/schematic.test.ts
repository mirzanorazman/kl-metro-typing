import { describe, it, expect } from 'vitest';
import { expandLine, buildSchematic, STEP } from './schematic';
import type { Line } from '../data/types';

const stub: Line = {
  code: 'MR',
  name: 'Test',
  colour: '#000000',
  termini: ['A', 'C'],
  stations: ['a', 'b', 'c'],
  schematic: { start: { x: 100, y: 100 }, segments: [['E', 1], ['SE', 1]] },
};

describe('expandLine', () => {
  it('places the first station at the start point', () => {
    expect(expandLine(stub).get('a')).toEqual({ x: 100, y: 100 });
  });

  it('advances one grid step per gap in the segment direction', () => {
    expect(expandLine(stub).get('b')).toEqual({ x: 100 + STEP, y: 100 });
    expect(expandLine(stub).get('c')).toEqual({ x: 100 + STEP * 2, y: 100 + STEP });
  });

  it('throws when the segments do not account for every gap', () => {
    const bad = { ...stub, schematic: { ...stub.schematic, segments: [['E', 1] as const] } };
    expect(() => expandLine(bad as Line)).toThrow(/gap/i);
  });
});

describe('buildSchematic (shipped data)', () => {
  it('resolves every station to exactly one point', async () => {
    const { loadNetworkData } = await import('../data/load');
    const data = loadNetworkData();
    const { points, conflicts } = buildSchematic(data.lines);
    expect(conflicts).toEqual([]);
    expect(points.size).toBe(data.stations.length);
  });
});
