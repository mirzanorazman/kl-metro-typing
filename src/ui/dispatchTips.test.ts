import { describe, expect, it } from 'vitest';
import type { LineCode } from '../data/types';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { startCareer, type CareerState } from '../engine/dispatch';
import { cloneSim, type Dir, type Incident, type OosCause, type Train } from '../engine/dispatchSim';
import type { CrowdingHintSettings } from '../render/crowdingHint';
import {
  DISPATCH_TIPS, closureText, dispatchTipText, failureText, newDispatchTips, tipSubject,
} from './dispatchTips';

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

  it('sees the first Service gap start, and not as a generic Incident', () => {
    const prev = running([waiting(1, 'KJ', 'Damai'), waiting(2, 'KJ', 'Dang Wangi')]);
    const next = withSim(prev, (sim) => { sim.incidents.push({ ...fault, id: 9, kind: 'service-gap', stations: [], train: 2 }); });
    expect(newDispatchTips(net, prev, next, none)).toEqual(['service-gap']);
  });

  it('tipSubject points at the Service gap pair and its place, or the late train, and null when gone', () => {
    // Rear at Kampung Baru, its leader one block ahead at Dang Wangi.
    const pair = withSim(running([waiting(1, 'KJ', 'Kampung Baru'), waiting(2, 'KJ', 'Dang Wangi')]), (sim) => {
      sim.incidents.push({ ...fault, id: 4, kind: 'service-gap', place: idOf('KLCC'), stations: [], train: 1 });
    });
    expect(tipSubject(net, pair, 'service-gap')).toEqual({ trains: [1, 2], stations: [idOf('KLCC')] });
    expect(tipSubject(net, withSim(pair, (sim) => { sim.trains = sim.trains.filter((t) => t.id !== 1); }), 'service-gap'))
      .toBeNull();
    expect(tipSubject(net, withSim(pair, (sim) => { sim.incidents = []; }), 'service-gap')).toBeNull();

    const late = withSim(running([waiting(1, 'KJ', 'Jelatek'), waiting(2, 'KJ', 'Bangsar', -1)]), (sim) => {
      sim.shiftMs = 600_000;
    });
    expect(tipSubject(net, late, 'late')).toEqual({ trains: [1], stations: [idOf('Jelatek')] });
    expect(tipSubject(net, withSim(late, (sim) => { sim.trains = []; }), 'late')).toBeNull();

    expect(tipSubject(net, pair, 'expansion')).toBeNull();
  });

  it('tipSubject points at the newest train for a new train, and at the last closed Station for a closure', () => {
    const joined = running([waiting(1, 'KJ', 'Jelatek'), waiting(3, 'KJ', 'Gombak'), waiting(2, 'KJ', 'Bangsar')]);
    expect(tipSubject(net, joined, 'new-train')).toEqual({ trains: [3], stations: [idOf('Gombak')] });
    expect(tipSubject(net, withSim(joined, (sim) => { sim.trains = []; }), 'new-train')).toBeNull();

    const closed = withSim(running([waiting(1, 'KJ', 'Jelatek')]), (sim) => {
      sim.oosOrder = [idOf('Ampang Park'), idOf('KLCC')];
    });
    expect(tipSubject(net, closed, 'out-of-service')).toEqual({ trains: [], stations: [idOf('KLCC')] });
    expect(tipSubject(net, running([waiting(1, 'KJ', 'Jelatek')]), 'out-of-service')).toBeNull();
  });

  it('sees a late Train offer a Station further ahead', () => {
    const prev = running([waiting(1, 'KJ', 'Jelatek')]);
    const next = withSim(prev, (sim) => {
      sim.shiftMs = 600_000;
    });
    expect(newDispatchTips(net, prev, next, none)).toEqual(['late']);
    expect(newDispatchTips(net, next, next, none)).toEqual([]);
  });

  it('sees a train join mid-Shift, once', () => {
    const prev = running([waiting(1, 'KJ', 'Jelatek')]);
    const next = withSim(prev, (sim) => { sim.trains.push(waiting(2, 'KJ', 'Damai')); sim.nextTrainId = 3; });
    expect(newDispatchTips(net, prev, next, none)).toEqual(['new-train']);
    expect(newDispatchTips(net, prev, next, new Set(['new-train']))).toEqual([]);
  });

  it("a new Shift's fresh trains are not a train joining", () => {
    const prev = running([waiting(1, 'KJ', 'Jelatek')]);
    const next = { ...withSim(prev, (sim) => { sim.trains.push(waiting(2, 'KJ', 'Damai')); sim.nextTrainId = 3; }), shift: 2 };
    expect(newDispatchTips(net, prev, next, none)).not.toContain('new-train');
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
    const prev = running([waiting(1, 'KJ', 'Damai'), waiting(2, 'KJ', 'Dang Wangi')]);
    const next = {
      ...withSim(prev, (sim) => { sim.incidents.push({ ...fault, id: 9, kind: 'service-gap', stations: [], train: 2 }); }),
      shift: 2,
    };
    expect(newDispatchTips(net, prev, next, none)).toEqual([]);
  });

  describe('the crowding hint', () => {
    const B: CrowdingHintSettings = { mode: 'b', delayMs: 5_000, declutter: false };
    const A: CrowdingHintSettings = { ...B, mode: 'a' };
    /** KLCC's countdown at `fullMs`, with whatever Trains are given. */
    const crowdedAt = (fullMs: number, trains: Train[] = []) => withSim(running(trains), (sim) => {
      sim.platforms[idOf('KLCC')]!.fullMs = fullMs;
      sim.platforms[idOf('KLCC')]!.waiting = { [idOf('Bangsar')]: 60 };
    });

    it('sees the hint show for the first time, and only while it is switched on', () => {
      const prev = crowdedAt(4_900);
      const next = crowdedAt(5_000);
      expect(newDispatchTips(net, prev, next, none, B)).toEqual(['crowding']);
      expect(newDispatchTips(net, prev, prev, none, B)).toEqual([]);
      expect(newDispatchTips(net, prev, withSim(prev, () => {}), none, B)).toEqual([]);
      expect(newDispatchTips(net, prev, next, none, { ...B, mode: 'off' })).toEqual([]);
      expect(newDispatchTips(net, prev, next, none)).toEqual([]);
      expect(newDispatchTips(net, prev, next, new Set(['crowding']), B)).toEqual([]);
    });

    it('under A, waits for an amber chip, since there is no ring', () => {
      const relieving = [waiting(1, 'KJ', 'Damai')];
      expect(newDispatchTips(net, crowdedAt(0), crowdedAt(5_000), none, A)).toEqual([]);
      expect(newDispatchTips(net, crowdedAt(0, relieving), crowdedAt(5_000, relieving), none, A)).toEqual(['crowding']);
    });

    it('tipSubject points at the crowded Station and the Trains that relieve it', () => {
      const s = crowdedAt(5_000, [waiting(1, 'KJ', 'Damai'), waiting(2, 'KJ', 'Jelatek')]);
      expect(tipSubject(net, s, 'crowding', B)).toEqual({ trains: [1], stations: [idOf('KLCC')] });
      expect(tipSubject(net, crowdedAt(0), 'crowding', B)).toBeNull();
      expect(tipSubject(net, s, 'crowding')).toBeNull();
    });

    it('says what the hint shows in each mode', () => {
      expect(dispatchTipText('crowding')).toBe(
        'This platform is overcrowding. The ring fills while 55 or more people wait; when it is full, the station goes out of service. Clear the amber trains to bring trains here.',
      );
      expect(dispatchTipText('crowding', 'a')).toBe(
        'A platform ahead is overcrowding. Clear the amber trains to bring trains there before it goes out of service.',
      );
    });
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
    expect(DISPATCH_TIPS.map((t) => t.id))
      .toEqual(['start', 'incident', 'service-gap', 'late', 'new-train', 'crowding', 'out-of-service', 'expansion']);
    expect(dispatchTipText('start'))
      .toBe("Every red signal on your Line is a train waiting for you. Trains you don't clear wait. Type any waiting Station's name to start your first Shift.");
    expect(dispatchTipText('start')).toMatch(/red signal/);
    expect(dispatchTipText('incident'))
      .toBe('An incident holds trains until you type its fix. Left too long, the station goes out of service.');
    expect(dispatchTipText('service-gap')).toBe(
      'These two trains are too close together, so the Station behind them waits longer. Type the fix to hold the second one, or get the front one moving.',
    );
    expect(dispatchTipText('late')).toBe(
      'This train is late: its next platform has waited too long. Type the farther Station shown beside it to run it express.',
    );
    expect(dispatchTipText('new-train')).toBe(
      'A new train has joined at the end of the line. Trains join during the peaks until each line has its full fleet; longer lines get more trains.',
    );
    expect(dispatchTipText('out-of-service'))
      .toBe('A station is out of service. Each closure fills the gauge at the top; when it is full, the Shift fails.');
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
