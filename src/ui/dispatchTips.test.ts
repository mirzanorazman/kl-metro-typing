import { describe, expect, it } from 'vitest';
import type { LineCode } from '../data/types';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { startCareer, type CareerState } from '../engine/dispatch';
import { cloneSim, type Dir, type Incident, type OosCause, type Train } from '../engine/dispatchSim';
import { DISPATCH_TIPS, closureText, dispatchTipText, failureText, newDispatchTips } from './dispatchTips';

const net = buildNetwork(loadNetworkData());
const none = new Set<string>();
const idOf = (name: string) => [...net.stations.values()].find((s) => s.name === name)!.id;

function waiting(id: number, line: LineCode, name: string, dir: Dir = 1): Train {
  const at = net.lines.get(line)!.stations.indexOf(idOf(name));
  return { id, line, dir, at, stage: 'signal', ms: 0, skipTo: null, load: {}, lastExchange: null };
}

/** A running Career whose Trains are exactly `trains`. */
function running(trains: Train[]): CareerState {
  const base = startCareer(net, 7);
  const sim = cloneSim(base.sim);
  sim.trains = trains;
  sim.nextTrainId = trains.length + 1;
  return { ...base, status: 'running', startedAt: 0, sim };
}

function withSim(s: CareerState, change: (sim: CareerState['sim']) => void): CareerState {
  const sim = cloneSim(s.sim);
  change(sim);
  return { ...s, sim };
}

const fault: Incident = {
  id: 1, kind: 'signal-fault', place: idOf('Masjid Jamek'),
  stations: [idOf('Dang Wangi'), idOf('Masjid Jamek'), idOf('Pasar Seni')],
  line: 'KJ', train: null, startedMs: 0, step: 0, extra: 0,
};

describe('newDispatchTips', () => {
  it('finds nothing when nothing happened, and never returns start', () => {
    const s = running([waiting(1, 'KJ', 'Jelatek')]);
    expect(newDispatchTips(net, s, s, none)).toEqual([]);
    const ready = startCareer(net, 7);
    expect(newDispatchTips(net, ready, { ...ready, status: 'running', startedAt: 0 }, none)).not.toContain('start');
  });

  it('sees the first Incident, once', () => {
    const prev = running([waiting(1, 'KJ', 'Jelatek')]);
    const next = withSim(prev, (sim) => {
      sim.incidents = [fault];
      sim.nextIncidentId = 2;
    });
    expect(newDispatchTips(net, prev, next, none)).toEqual(['incident']);
    expect(newDispatchTips(net, next, next, none)).toEqual([]);
  });

  it('sees Trains start bunching', () => {
    const prev = running([waiting(1, 'KJ', 'Damai'), waiting(2, 'KJ', 'Bangsar')]);
    const next = running([waiting(1, 'KJ', 'Damai'), waiting(2, 'KJ', 'Ampang Park')]);
    expect(newDispatchTips(net, prev, next, none)).toEqual(['bunching']);
    expect(newDispatchTips(net, next, next, none)).toEqual([]);
  });

  it('sees a late Train offer a Station further ahead', () => {
    const prev = running([waiting(1, 'KJ', 'Jelatek')]);
    const next = withSim(prev, (sim) => {
      sim.shiftMs = 600_000;
    });
    expect(newDispatchTips(net, prev, next, none)).toEqual(['late']);
    expect(newDispatchTips(net, next, next, none)).toEqual([]);
  });

  it('sees a Station go Out of service', () => {
    const prev = running([waiting(1, 'KJ', 'Jelatek')]);
    const next = withSim(prev, (sim) => {
      sim.outOfService = { [idOf('KLCC')]: 'crowding' };
      sim.oosOrder = [idOf('KLCC')];
    });
    expect(newDispatchTips(net, prev, next, none)).toEqual(['out-of-service']);
  });

  it('sees a Cleared Shift reach the Expansion screen', () => {
    const prev = running([waiting(1, 'KJ', 'Jelatek')]);
    expect(newDispatchTips(net, prev, { ...prev, status: 'between', cleared: 1 }, none)).toEqual(['expansion']);
  });

  it('ignores the fresh sim of a new Shift', () => {
    const prev = running([waiting(1, 'KJ', 'Damai'), waiting(2, 'KJ', 'Bangsar')]);
    const next = { ...running([waiting(1, 'KJ', 'Damai'), waiting(2, 'KJ', 'Ampang Park')]), shift: 2 };
    expect(newDispatchTips(net, prev, next, none)).toEqual([]);
  });

  it('queues coinciding moments in tip order, minus those seen', () => {
    const prev = running([waiting(1, 'KJ', 'Jelatek')]);
    const next = withSim(prev, (sim) => {
      sim.incidents = [fault];
      sim.outOfService = { [idOf('KLCC')]: 'crowding' };
      sim.oosOrder = [idOf('KLCC')];
    });
    expect(newDispatchTips(net, prev, next, none)).toEqual(['incident', 'out-of-service']);
    expect(newDispatchTips(net, prev, next, new Set(['incident']))).toEqual(['out-of-service']);
  });

  it('has the agreed copy, in Dispatcher vocabulary', () => {
    expect(DISPATCH_TIPS.map((t) => t.id)).toEqual(['start', 'incident', 'bunching', 'late', 'out-of-service', 'expansion']);
    expect(dispatchTipText('start'))
      .toBe("Every red signal on your Line is a train waiting for you. Trains you don't clear wait. Type any waiting Station's name to start your first Shift.");
    expect(dispatchTipText('start')).toMatch(/red signal/);
    expect(dispatchTipText('incident'))
      .toBe('An incident holds trains until you type its fix. Left too long, the station goes out of service.');
    expect(dispatchTipText('bunching'))
      .toBe('Trains are bunching. Holding one back (not clearing it) evens out the gaps.');
    expect(dispatchTipText('late')).toBe('A late train offers a station further ahead. Type that to run it express.');
    expect(dispatchTipText('out-of-service'))
      .toBe('A station is out of service. Lose a quarter of your network and the shift fails.');
    expect(dispatchTipText('expansion'))
      .toBe("Shift cleared. Choose where your network grows. Type a station's name or click it.");
    for (const { text } of DISPATCH_TIPS) expect(text).not.toMatch(/\b(fire|issue|prompt|gate)\b/i);
  });
});

describe('failureText', () => {
  const at = (name: string, cause: OosCause) => ({ station: idOf(name), cause });

  it('leads with the first closure as what started the collapse', () => {
    expect(failureText(net, { shift: 3, closures: [at('Masjid Jamek', 'signal-fault'), at('KLCC', 'crowding')] }))
      .toBe('Shift 3 ended: it started when Masjid Jamek went out of service after a signal fault was left unfixed.');
    expect(failureText(net, { shift: 2, closures: [at('KLCC', 'crowding')] }))
      .toBe('Shift 2 ended: it started when KLCC went out of service because its platform overflowed.');
  });

  it('names each closure with its cause', () => {
    expect(closureText(net, at('Masjid Jamek', 'signal-fault')))
      .toBe('Masjid Jamek went out of service after a signal fault was left unfixed.');
    expect(closureText(net, at('KLCC', 'crowding'))).toBe('KLCC went out of service because its platform overflowed.');
    expect(closureText(net, at('KLCC', 'train-fault'))).toBe('KLCC went out of service after a train fault was left unfixed.');
    expect(closureText(net, at('KLCC', 'crowd-surge'))).toBe('KLCC went out of service after a crowd surge was left unfixed.');
  });
});
