import { describe, expect, it } from 'vitest';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from './network';
import { prepareQuickRun, quickRunToward } from './quickRun';

function network() {
  return buildNetwork(loadNetworkData());
}

describe('prepareQuickRun', () => {
  it('starts a Monorail run at KL Sentral when choosing toward Titiwangsa', () => {
    const state = prepareQuickRun(network(), 'MR', 'titiwangsa', null, () => 0);

    expect(state.status).toBe('ready');
    expect(state.at).toBe('kl-sentral');
    expect(state.typing.target).toBe('KL Sentral');
    expect(state.startedAt).toBeNull();
    expect(state.stationStartedAt).toBeNull();
    expect(state.deadline).toBeNull();
    expect(state.endedAt).toBeNull();
  });

  it('never chooses the destination terminus as the starting station', () => {
    const state = prepareQuickRun(network(), 'MR', 'titiwangsa', null, () => 0.999);

    expect(state.at).not.toBe('titiwangsa');
  });

  it('excludes the previous starting station when alternatives exist', () => {
    const state = prepareQuickRun(network(), 'MR', 'titiwangsa', 'kl-sentral', () => 0);

    expect(state.at).toBe('tun-sambanthan');
  });

  it('rejects a non-terminus destination', () => {
    expect(() => prepareQuickRun(network(), 'MR', 'imbi', null, () => 0)).toThrow(
      'Quick Run destination must be a terminus',
    );
  });

  it('travels toward the first terminus and displays its name', () => {
    const state = prepareQuickRun(network(), 'MR', 'kl-sentral', null, () => 0);

    expect(state.direction).toBe(-1);
    expect(quickRunToward(network(), state)).toBe('KL Sentral');
  });

  it('clamps a random value of exactly one to the final eligible candidate', () => {
    const state = prepareQuickRun(network(), 'MR', 'titiwangsa', null, () => 1);

    expect(state.at).toBe('chow-kit');
  });

  it('returns fresh arrays and typing state for each preparation', () => {
    const net = network();
    const first = prepareQuickRun(net, 'MR', 'titiwangsa', null, () => 0);
    const second = prepareQuickRun(net, 'MR', 'titiwangsa', null, () => 0);

    expect(second.completedStations).not.toBe(first.completedStations);
    expect(second.typing).not.toBe(first.typing);
    first.completedStations.push({ id: 'kl-sentral', ms: 1 });
    first.typing.cursor = 2;
    expect(second.completedStations).toEqual([]);
    expect(second.typing.cursor).toBe(0);
  });
});
