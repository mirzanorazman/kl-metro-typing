import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { startCareer, type CareerState } from '../engine/dispatch';
import { cloneSim, closeStation, startShiftSim, type Incident, type OosCause } from '../engine/dispatchSim';
import { freshClosings, useClosures, type Closing } from './useClosures';

const net = buildNetwork(loadNetworkData());
const idOf = (name: string) => [...net.stations.values()].find((s) => s.name === name)!.id;

function signalFault(): Incident {
  return {
    id: 1, kind: 'signal-fault', place: idOf('Masjid Jamek'),
    stations: [idOf('Dang Wangi'), idOf('Masjid Jamek'), idOf('Pasar Seni')],
    line: 'KJ', train: null, startedMs: 0, step: 0, extra: 0,
  };
}

/** The Career, one Station further closed at `shiftMs`. */
function closed(career: CareerState, name: string, cause: OosCause, shiftMs: number): CareerState {
  const sim = cloneSim(career.sim);
  sim.shiftMs = shiftMs;
  closeStation(sim, idOf(name), cause);
  return { ...career, sim };
}

describe('useClosures', () => {
  it('ignores Stations already closed when it mounts', () => {
    const career = closed(startCareer(net, 7), 'KLCC', 'crowding', 5_000);
    const { result } = renderHook(({ c }) => useClosures(c), { initialProps: { c: career } });
    expect(result.current).toEqual([]);
  });

  it('reports a new closure with the Shift time it was seen and the Incident it ended', () => {
    const before = startCareer(net, 7);
    before.sim.incidents = [signalFault()];
    const { result, rerender } = renderHook(({ c }) => useClosures(c), { initialProps: { c: before } });
    const after = closed(before, 'Masjid Jamek', 'signal-fault', 12_000);
    after.sim.incidents = [];
    rerender({ c: after });
    expect(result.current).toEqual([
      { station: idOf('Masjid Jamek'), atMs: 12_000, incident: expect.objectContaining({ kind: 'signal-fault' }) },
    ]);
  });

  it('a crowding closure has no Incident', () => {
    const before = startCareer(net, 7);
    const { result, rerender } = renderHook(({ c }) => useClosures(c), { initialProps: { c: before } });
    rerender({ c: closed(before, 'KLCC', 'crowding', 8_000) });
    expect(result.current).toEqual([{ station: idOf('KLCC'), atMs: 8_000, incident: null }]);
  });

  it('forgets everything at a new Shift', () => {
    const before = startCareer(net, 7);
    const { result, rerender } = renderHook(({ c }) => useClosures(c), { initialProps: { c: before } });
    rerender({ c: closed(before, 'KLCC', 'crowding', 8_000) });
    expect(result.current).toHaveLength(1);
    rerender({ c: { ...before, shift: before.shift + 1, sim: startShiftSim(net, before.served, 99) } });
    expect(result.current).toEqual([]);
  });

  it('a resume or a repeated render adds nothing', () => {
    const before = startCareer(net, 7);
    const { result, rerender } = renderHook(({ c }) => useClosures(c), { initialProps: { c: before } });
    const after = closed(before, 'KLCC', 'crowding', 8_000);
    rerender({ c: after });
    rerender({ c: after });
    rerender({ c: { ...after, sim: cloneSim(after.sim) } });
    expect(result.current).toHaveLength(1);
  });
});

describe('freshClosings', () => {
  it('keeps only those younger than the window', () => {
    const list: Closing[] = [
      { station: 'a', atMs: 1_000, incident: null },
      { station: 'b', atMs: 2_000, incident: null },
    ];
    expect(freshClosings(list, 2_500, 1_000)).toEqual([list[1]]);
  });
});
