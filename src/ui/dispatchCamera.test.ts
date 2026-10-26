import { describe, expect, it } from 'vitest';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { STARTING_NETWORK } from '../engine/dispatchNetwork';
import { cloneSim, startShiftSim, type Incident } from '../engine/dispatchSim';
import { closeness, typedClears } from './dispatchCamera';

const net = buildNetwork(loadNetworkData());

function incident(id: number, place: string): Incident {
  return { id, kind: 'crowd-surge', place, stations: [place], line: 'KJ', train: null, startedMs: 0, step: 0, extra: 0 };
}

describe('closeness', () => {
  it('is the early closeness up to 14 Stations', () => {
    expect(closeness(10)).toBe(3);
    expect(closeness(14)).toBe(3);
  });

  it('is the late closeness from 40 Stations', () => {
    expect(closeness(40)).toBe(1.2);
    expect(closeness(51)).toBe(1.2);
  });

  it('eases linearly between them', () => {
    expect(closeness(27)).toBeCloseTo(2.1);
  });

  it('follows the given settings', () => {
    expect(closeness(27, { early: 2, late: 2 })).toBe(2);
  });
});

describe('typedClears', () => {
  const before = startShiftSim(net, STARTING_NETWORK, 1);
  before.incidents = [incident(1, 'klcc'), incident(2, 'kampung-baru')];

  it('names an Incident that is gone, its place still in service', () => {
    const after = cloneSim(before);
    after.incidents = after.incidents.filter((inc) => inc.id !== 1);
    expect(typedClears(before, after).map((inc) => inc.id)).toEqual([1]);
  });

  it('leaves out an Incident whose place went Out of service', () => {
    const after = cloneSim(before);
    after.incidents = after.incidents.filter((inc) => inc.id !== 1);
    after.outOfService['klcc'] = 'crowding';
    expect(typedClears(before, after)).toEqual([]);
  });

  it('names nothing when every Incident is still there', () => {
    expect(typedClears(before, cloneSim(before))).toEqual([]);
  });
});
