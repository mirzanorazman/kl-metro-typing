import { describe, expect, it } from 'vitest';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { startRush, type RushState } from '../engine/rushHour';
import { newRushTips, RUSH_TIPS, rushTipText } from './rushTips';

const net = buildNetwork(loadNetworkData());
const base = (): RushState => ({ ...startRush(net, ['KJ', 'KG'], 'kl-sentral', 1), status: 'running' });
const none = new Set<string>();

describe('newRushTips', () => {
  it('finds nothing when nothing happened', () => {
    const s = base();
    expect(newRushTips(s, s, none)).toEqual([]);
  });

  it('sees boarding and delivery on one arrival, in tip order', () => {
    const prev = { ...base(), load: [{ id: 1, target: 'AG' as const }] };
    const next = { ...prev, load: [{ id: 2, target: 'MR' as const }], delivered: 1 };
    expect(newRushTips(prev, next, none)).toEqual(['board', 'deliver']);
  });

  it('sees reaching a Junction, and a Walk when one is offered', () => {
    const prev = base();
    expect(newRushTips(prev, { ...prev, stage: 'junction', walks: [] }, none)).toEqual(['junction']);
    expect(newRushTips(prev, { ...prev, stage: 'junction', walks: ['muzium-negara'] }, none))
      .toEqual(['junction', 'walk']);
  });

  it('sees an Overflow ring start to fill', () => {
    const prev = base();
    const next = { ...prev, queues: { ...prev.queues, gombak: { passengers: [], overflowMs: 100 } } };
    expect(newRushTips(prev, next, none)).toEqual(['overflow']);
    expect(newRushTips(next, next, none)).toEqual([]);
  });

  it('skips tips already seen', () => {
    const prev = base();
    expect(newRushTips(prev, { ...prev, stage: 'junction', walks: ['muzium-negara'] }, new Set(['junction'])))
      .toEqual(['walk']);
  });

  it('has copy for every tip, in Passenger vocabulary', () => {
    for (const { id } of RUSH_TIPS) expect(rushTipText(id)).not.toMatch(/rider/i);
    expect(rushTipText('start')).toBe('Type the station name to start. Passengers appear near your train.');
  });
});
