import { describe, expect, it } from 'vitest';
import { loadNetworkData } from '../data/load';
import { STARTING_NETWORK } from '../engine/dispatchNetwork';
import { clearSignal, startShiftSim, stepSim, type PhaseNow, type Train } from '../engine/dispatchSim';
import { buildNetwork } from '../engine/network';
import { networkLayout } from '../geo/networkLayout';
import { hits, layoutPops, placeTrain, popBox, type PopWant } from './dispatchLayout';

describe('a Train moving on the map', () => {
  const net = buildNetwork(loadNetworkData());
  const { geo: layout } = networkLayout();
  const MIDDAY: PhaseNow = { multiplier: 0, flow: 'none', trainFactor: 1, escalation: 1 };
  const ids = net.lines.get('KJ')!.stations;
  const indexOf = (name: string) => ids.findIndex((id) => net.stations.get(id)!.name === name);

  /** One Train at the Signal before `name`, alone on the map. */
  function lone(name: string) {
    const s = startShiftSim(net, STARTING_NETWORK, 1);
    const train: Train = { id: 1, line: 'KJ', dir: 1, at: indexOf(name), stage: 'signal', ms: 0,
      skipTo: null, load: {}, lastExchange: null };
    s.trains = [train];
    return s;
  }

  /**
   * How far the Train is drawn moving along the track on each tick, from now
   * until it next waits at a Signal: along the stretch it is running on, or
   * the one it came in on when it stands. A negative step is the sprite
   * jumping back.
   */
  function steps(s: ReturnType<typeof lone>) {
    const moves: number[] = [];
    let was = placeTrain(net, layout, s.trains[0]!, 1)!.at;
    for (let tick = 0; tick < 400; tick++) {
      stepSim(net, s, MIDDAY);
      const t = s.trains[0]!;
      const placed = placeTrain(net, layout, t, 1)!;
      const [a, b] = t.stage === 'running' ? [t.at, t.at + t.dir] : [t.at - t.dir, t.at];
      const from = layout.get(ids[a]!)!;
      const to = layout.get(ids[b]!)!;
      const len = Math.hypot(to.x - from.x, to.y - from.y);
      moves.push(((placed.at.x - was.x) * (to.x - from.x) + (placed.at.y - was.y) * (to.y - from.y)) / len);
      was = placed.at;
      if (tick > 5 && s.trains[0]!.stage === 'signal') break;
    }
    return moves;
  }

  /**
   * A step back smaller than this is invisible (about 0.2 px at Shift 1's
   * framing): on a short block with a bend, crossing to the right-hand side of
   * the new direction can cost a hair of forward progress. The jump this
   * guards against was 6.5.
   */
  const HAIR = 0.05;

  it('never jumps back as it leaves a Station on a bend or arrives at the next Signal', () => {
    // Jelatek sits on a bend of about 53 degrees.
    const s = lone('Jelatek');
    expect(clearSignal(net, s, 1)).toBe(true);
    const moves = steps(s);
    expect(s.trains[0]!.stage).toBe('signal');
    expect(s.trains[0]!.at).toBe(indexOf('Jelatek') + 1);
    expect(Math.min(...moves)).toBeGreaterThan(-HAIR);
  });

  it('an express never jumps back as it passes the Station it skips', () => {
    const s = lone('Jelatek');
    // As `skipSignal` leaves a late Train: cleared to run through to two Stations on.
    const t = s.trains[0]!;
    Object.assign(t, { stage: 'cleared', skipTo: t.at + 2 });
    const moves = steps(s);
    expect(s.trains[0]!.at).toBe(indexOf('Jelatek') + 2);
    expect(Math.min(...moves)).toBeGreaterThan(-HAIR);
  });
});

describe('exchange pops', () => {
  const pop = (key: string, own = true, lines: 1 | 2 = 2): PopWant =>
    ({ key, at: { x: 0, y: 0 }, text: ['+12 boarded', '−3 off'].slice(0, lines), own });

  it('with nothing in the way, a pop sits centred above its Station', () => {
    const [placed] = layoutPops([pop('a')], 1, []);
    expect(placed!.x).toBe(0);
    expect(placed!.y).toBeLessThan(0);
    const box = popBox(placed!);
    expect(box.y1).toBeLessThanOrEqual(0);
  });

  it('pops at one Station stack upward', () => {
    const [a, b] = layoutPops([pop('a'), pop('b')], 1, []);
    expect(hits(popBox(a!), popBox(b!))).toBe(false);
    expect(b!.y).toBeLessThan(a!.y);
  });

  it('a pop whose usual spot is under a chip is placed clear of every chip', () => {
    const [free] = layoutPops([pop('a')], 1, []);
    const over = popBox(free!);
    // One chip over the usual spot, others round about.
    const chips = [
      { x0: over.x0 - 10, y0: over.y0 - 5, x1: over.x1 + 10, y1: over.y1 + 5 },
      { x0: 20, y0: -10, x1: 120, y1: 10 },
    ];
    for (const own of [true, false]) {
      const [placed] = layoutPops([pop('a', own)], 1, chips);
      expect(placed, 'every pop still shows').toBeTruthy();
      for (const chip of chips) expect(hits(popBox(placed!), chip)).toBe(false);
    }
  });

  it('pops keep on the visible map and out from under its panels', () => {
    const frame = { view: { x0: -40, y0: -15, x1: 400, y1: 400 }, panels: [{ x0: -400, y0: -400, x1: 400, y1: -15 }] };
    const [placed] = layoutPops([pop('a')], 1, [], frame);
    const box = popBox(placed!);
    expect(box.y0).toBeGreaterThanOrEqual(-15);
    expect(box.x0).toBeGreaterThanOrEqual(-40);
  });
});
