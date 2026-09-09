import { describe, it, expect } from 'vitest';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { linesOf } from '../engine/network';
import { DRAW_EASE, entranceTiming, timeToReach } from './entrance';

const data = loadNetworkData();
const net = buildNetwork(data);

describe('entranceTiming', () => {
  it('gives every station a moment to appear', () => {
    const timing = entranceTiming(net);
    for (const id of net.stations.keys()) {
      expect(timing.station.get(id)).toBeTypeOf('number');
    }
  });

  it('starts each line after the one before it', () => {
    const timing = entranceTiming(net);
    const starts = [...net.lines.keys()].map((code) => timing.line.get(code)!.delay);
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i]!).toBeGreaterThan(starts[i - 1]!);
    }
  });

  it('draws a long line for longer than a short one', () => {
    const timing = entranceTiming(net);
    const kj = net.lines.get('KJ')!;
    const mr = net.lines.get('MR')!;
    expect(kj.stations.length).toBeGreaterThan(mr.stations.length);
    expect(timing.line.get('KJ')!.duration).toBeGreaterThan(timing.line.get('MR')!.duration);
  });

  it('walks the stations along a line in order', () => {
    const timing = entranceTiming(net);
    const line = net.lines.get('MR')!;
    // Only the stops this line has to itself: an interchange takes its
    // earliest line, which is a different rule, tested below.
    const own = line.stations.filter((id) => linesOf(net.stations.get(id)!).length === 1);
    const delays = own.map((id) => timing.station.get(id)!);
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]!).toBeGreaterThan(delays[i - 1]!);
    }
    expect(own.length).toBeGreaterThan(1);
  });

  it('pops an interchange as its earliest line reaches it', () => {
    const timing = entranceTiming(net);
    const interchange = [...net.stations.values()].find((s) => linesOf(s).length > 1)!;
    const alongEachLine = linesOf(interchange).map((code) => {
      const line = net.lines.get(code)!;
      const at = line.stations.indexOf(interchange.id);
      const { delay, duration } = timing.line.get(code)!;
      return delay + timeToReach(at / (line.stations.length - 1)) * duration;
    });
    expect(timing.station.get(interchange.id)).toBeCloseTo(Math.min(...alongEachLine), 5);
  });

  it('pops a station when the stroke reaches it, not on a straight clock', () => {
    // The stroke eases out, so it is most of the way along well before it is
    // most of the way through its time. A dot timed on a straight clock is
    // left behind by a tip that has already passed it.
    const timing = entranceTiming(net);
    const line = net.lines.get('KJ')!;
    const { delay, duration } = timing.line.get('KJ')!;
    const middle = line.stations[Math.floor((line.stations.length - 1) / 2)]!;
    expect(timing.station.get(middle)!).toBeLessThan(delay + duration * 0.5);
  });

  it('runs until the last mark has settled', () => {
    const timing = entranceTiming(net);
    for (const at of timing.station.values()) expect(timing.total).toBeGreaterThan(at);
    for (const { delay, duration } of timing.line.values()) {
      expect(timing.total).toBeGreaterThanOrEqual(delay + duration);
    }
  });
});

describe('timeToReach', () => {
  it('spans the whole draw from end to end', () => {
    expect(timeToReach(0)).toBeCloseTo(0, 4);
    expect(timeToReach(1)).toBeCloseTo(1, 4);
  });

  it('never goes backwards', () => {
    let last = -1;
    for (let f = 0; f <= 1.0001; f += 0.02) {
      const t = timeToReach(f);
      expect(t).toBeGreaterThanOrEqual(last);
      last = t;
    }
  });

  it('inverts the very curve the stylesheet animates the stroke with', () => {
    // The two must not drift: the curve is published as `DRAW_EASE` and the
    // canvas hands it to CSS, so there is one definition, not two.
    const [x1, y1, x2, y2] = DRAW_EASE.control;
    const at = (a: number, b: number, t: number) => {
      const u = 1 - t;
      return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t;
    };
    // Walk the curve directly: at parameter t the stroke has covered `y` of
    // the line at `x` of its time, so timeToReach(y) must give back x.
    for (const t of [0.15, 0.3, 0.5, 0.75, 0.9]) {
      expect(timeToReach(at(y1, y2, t))).toBeCloseTo(at(x1, x2, t), 4);
    }
  });

  it('publishes the curve in the form CSS wants', () => {
    expect(DRAW_EASE.css).toBe(`cubic-bezier(${DRAW_EASE.control.join(', ')})`);
  });
});
