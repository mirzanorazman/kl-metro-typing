import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { LineCode } from '../data/types';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { emptyProfile, saveProfile } from '../engine/progress';
import { startCareer, type CareerState } from '../engine/dispatch';
import { servedStations, STARTING_NETWORK, type Served } from '../engine/dispatchNetwork';
import { cloneSim, startShiftSim, type Dir, type Incident, type Train } from '../engine/dispatchSim';
import { visibleTargets } from '../engine/dispatchTargets';
import { music } from '../audio/sound';
import { DispatcherScreen } from './DispatcherScreen';
import { TypingInputProvider } from './TypingInputProvider';

const net = buildNetwork(loadNetworkData());
const type = (text: string) => {
  for (const ch of text) fireEvent.keyDown(window, { key: ch });
};
const press = (key: string) => fireEvent.keyDown(window, { key });
const idOf = (name: string) => [...net.stations.values()].find((s) => s.name === name)!.id;
const originalRect = Element.prototype.getBoundingClientRect;

/** A Train waiting at the Signal before `name` on `line`. */
function waiting(id: number, line: LineCode, name: string, dir: Dir = 1): Train {
  const at = net.lines.get(line)!.stations.indexOf(idOf(name));
  return { id, line, dir, at, stage: 'signal', ms: 0, skipTo: null, load: {} };
}

/** A fresh Career whose Trains are exactly `trains`. */
function careerWith(trains: Train[], served: Served = STARTING_NETWORK): CareerState {
  const base = startCareer(net, 7);
  const sim = cloneSim(served === STARTING_NETWORK ? base.sim : startShiftSim(net, served, base.sim.rng));
  sim.trains = trains;
  sim.nextTrainId = trains.length + 1;
  return { ...base, served: served.map((r) => ({ ...r })), sim };
}

function signalFault(): Incident {
  return {
    id: 1, kind: 'signal-fault', place: idOf('Masjid Jamek'),
    stations: [idOf('Dang Wangi'), idOf('Masjid Jamek'), idOf('Pasar Seni')],
    line: 'KJ', train: null, startedMs: 0, step: 0,
  };
}

const renderShift = (initial?: CareerState) => render(
  <TypingInputProvider enabled={false}>
    <DispatcherScreen net={net} onExit={() => {}} onAgain={() => {}} initial={initial} />
  </TypingInputProvider>,
);

const signalLabels = () => screen.queryAllByTestId('dispatch-signal');
const labelFor = (name: string) => signalLabels().find((el) => el.textContent?.includes(name));

beforeEach(() => {
  localStorage.clear();
  // Tips are Task 10's; mark any that exist as seen so they never interrupt.
  saveProfile({ ...emptyProfile(), dispatchTipsSeen: ['start', 'incident', 'bunching', 'late', 'out-of-service', 'expansion'] });
  Element.prototype.getBoundingClientRect = function () {
    return { x: 0, y: 0, top: 0, left: 0, right: 1512, bottom: 690,
      width: 1512, height: 690, toJSON: () => ({}) } as DOMRect;
  };
  window.matchMedia = ((q: string) => ({
    matches: true, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  Element.prototype.getBoundingClientRect = originalRect;
  vi.restoreAllMocks();
});

describe('DispatcherScreen', () => {
  it('shows the whole Served network, not a follow camera', () => {
    const { container } = renderShift();
    const texts = [...container.querySelectorAll('svg text')].map((t) => t.textContent);
    for (const id of servedStations(net, STARTING_NETWORK)) {
      expect(texts).toContain(net.stations.get(id)!.name);
    }
  });

  it("each Held Train shows its Signal's Station name", () => {
    const initial = startCareer(net, 7);
    renderShift(initial);
    const signals = visibleTargets(net, initial.sim).filter((t) => t.ref.kind === 'signal');
    expect(signals.length).toBeGreaterThan(0);
    const overlay = screen.getByTestId('dispatch-overlay');
    for (const target of signals) {
      const label = within(overlay).getAllByTestId('dispatch-signal').find((el) => el.textContent?.includes(target.text));
      expect(label, target.text).toBeTruthy();
    }
  });

  it('typing narrows and highlights candidates', () => {
    renderShift(careerWith([
      waiting(1, 'KJ', 'KLCC'), waiting(2, 'KJ', 'Kampung Baru'),
      waiting(3, 'KJ', 'Kerinchi', -1), waiting(4, 'KJ', 'Jelatek'),
    ]));
    type('k');
    for (const name of ['KLCC', 'Kampung Baru', 'Kerinchi']) {
      expect(labelFor(name)!.getAttribute('data-candidate')).toBe('true');
    }
    expect(labelFor('Jelatek')!.getAttribute('data-candidate')).toBeNull();
    const prompt = document.querySelector('.prompt')!;
    const done = [...prompt.querySelectorAll('[data-state="done"]')].map((c) => c.textContent).join('');
    expect(done.toLowerCase()).toBe('k');
  });

  it('typing a full name Clears that Train', () => {
    renderShift(careerWith([waiting(1, 'KJ', 'Jelatek'), waiting(2, 'KJ', 'Pasar Seni')]));
    expect(labelFor('Jelatek')).toBeTruthy();
    type('Jelatek');
    expect(labelFor('Jelatek')).toBeUndefined();
    expect(labelFor('Pasar Seni')).toBeTruthy();
  });

  it('Enter clears an exact shorter name while a longer one still matches', () => {
    const served: Served = [...STARTING_NETWORK, { line: 'AG', from: 15, to: 17 }];
    renderShift(careerWith([waiting(1, 'AG', 'Ampang'), waiting(2, 'KJ', 'Ampang Park')], served));
    type('Ampang');
    expect(screen.getByRole('note').textContent).toBe('Enter to clear Ampang');
    press('Enter');
    expect(signalLabels().map((el) => el.textContent)).not.toContain('Ampang');
    expect(labelFor('Ampang Park')).toBeTruthy();
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('Backspace unlocks; Escape pauses, and Enter resumes', () => {
    renderShift(careerWith([waiting(1, 'KJ', 'Jelatek'), waiting(2, 'KJ', 'Pasar Seni')]));
    type('Je');
    expect(screen.getByLabelText('Type Jelatek')).toBeTruthy();
    expect(labelFor('Jelatek')!.getAttribute('data-locked')).toBe('true');
    press('Backspace');
    expect(screen.queryByLabelText('Type Jelatek')).toBeNull();
    expect(labelFor('Jelatek')!.getAttribute('data-locked')).toBeNull();

    press('Escape');
    expect(screen.getByRole('dialog', { name: 'Paused' })).toBeTruthy();
    type('Pasar');
    expect(labelFor('Pasar Seni')!.getAttribute('data-candidate')).toBeNull();
    press('Enter');
    expect(screen.queryByRole('dialog', { name: 'Paused' })).toBeNull();
    type('P');
    expect(labelFor('Pasar Seni')!.getAttribute('data-locked')).toBe('true');
  });

  describe('blur pauses only a running Career', () => {
    const blur = () => act(() => {
      window.dispatchEvent(new Event('blur'));
    });

    it('pauses a running Career, ignores a second blur, and Enter resumes', () => {
      renderShift(careerWith([waiting(1, 'KJ', 'Jelatek')]));
      type('J');
      blur();
      expect(screen.getByRole('dialog', { name: 'Paused' })).toBeTruthy();
      expect(() => blur()).not.toThrow();
      expect(screen.getAllByRole('dialog', { name: 'Paused' })).toHaveLength(1);
      press('Enter');
      expect(screen.queryByRole('dialog', { name: 'Paused' })).toBeNull();
    });

    it('leaves the between-Shifts screen alone', () => {
      const between: CareerState = { ...startCareer(net, 7), status: 'between', cleared: 1,
        startedAt: 1_000, stoppedAt: 2_000 };
      renderShift(between);
      expect(screen.getByRole('heading', { name: 'Shift 1 cleared' })).toBeTruthy();
      blur();
      expect(screen.queryByRole('dialog', { name: 'Paused' })).toBeNull();
      expect(screen.getByRole('heading', { name: 'Shift 1 cleared' })).toBeTruthy();
    });
  });

  it('Incidents are listed with kind, place and a timer', () => {
    const initial = careerWith([waiting(1, 'KJ', 'Jelatek')]);
    initial.sim.incidents = [signalFault()];
    initial.sim.nextIncidentId = 2;
    renderShift(initial);
    const list = screen.getByRole('list', { name: 'Incidents' });
    const card = within(list).getByRole('listitem');
    expect(card.textContent).toContain('Signal fault');
    expect(card.textContent).toContain('Masjid Jamek');
    const timer = within(card).getByRole('progressbar');
    expect(timer.getAttribute('aria-label')).toMatch(/Masjid Jamek/);
    expect(screen.getByTestId('dispatch-incident')).toBeTruthy();
  });

  it('Out of service and bunching are marked with shapes, not only colour', () => {
    const initial = careerWith([waiting(1, 'KJ', 'Damai'), waiting(2, 'KJ', 'Ampang Park'), waiting(3, 'KJ', 'Bangsar', -1)]);
    initial.sim.outOfService = { [idOf('Kampung Baru')]: 'crowding' };
    initial.sim.oosOrder = [idOf('Kampung Baru')];
    renderShift(initial);
    const oos = screen.getByTestId('dispatch-oos');
    expect(oos.querySelector('[data-icon]')).toBeTruthy();
    const trains = screen.getAllByTestId('dispatch-train');
    const bunched = trains.filter((t) => t.getAttribute('data-bunched') === 'true').map((t) => t.getAttribute('data-train'));
    expect(bunched.sort()).toEqual(['1', '2']);
  });

  it('top bar shows Shift number, phase with direction, Delivered and on-time %', () => {
    const initial = careerWith([waiting(1, 'KJ', 'Jelatek')]);
    initial.shift = 3;
    initial.sim.delivered = 42;
    initial.sim.calls = 10;
    initial.sim.onTimeCalls = 9;
    renderShift(initial);
    const bar = screen.getByRole('banner', { name: 'Shift' });
    expect(bar.textContent).toMatch(/Shift 3/);
    expect(bar.textContent).toMatch(/Morning peak/);
    expect(bar.textContent).toMatch(/inbound/i);
    expect(within(bar).getByText('42')).toBeTruthy();
    expect(within(bar).getByText('90%')).toBeTruthy();
  });

  it('music: calm while running, tense while any Incident or Out of service', () => {
    const play = vi.spyOn(music, 'play').mockImplementation(() => {});
    vi.spyOn(music, 'stop').mockImplementation(() => {});
    const calm = renderShift(careerWith([waiting(1, 'KJ', 'Jelatek')]));
    expect(play).not.toHaveBeenCalled();
    type('J');
    expect(play).toHaveBeenLastCalledWith('rushCalm');
    calm.unmount();

    const initial = careerWith([waiting(1, 'KJ', 'Jelatek')]);
    initial.sim.incidents = [signalFault()];
    renderShift(initial);
    type('J');
    expect(play).toHaveBeenLastCalledWith('rushTense');
  });

  it('the between-Shifts placeholder moves on to the next Shift', () => {
    renderShift({ ...startCareer(net, 7), status: 'between', cleared: 1, startedAt: 1_000, stoppedAt: 2_000, offers: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Next Shift' }));
    expect(screen.getByRole('banner', { name: 'Shift' }).textContent).toMatch(/Shift 2/);
  });

  it('renders the phone-landscape block instead of the Shift', () => {
    render(
      <TypingInputProvider enabled={false}>
        <DispatcherScreen net={net} onExit={() => {}} onAgain={() => {}} phoneLandscape />
      </TypingInputProvider>,
    );
    expect(screen.getByText('Rotate to portrait to play')).toBeTruthy();
  });
});
