import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { LineCode } from '../data/types';
import { loadNetworkData } from '../data/load';
import {
  DISPATCH_BOARD_KEY, saveDispatchBoard, submitDispatchEntry, loadDispatchBoard, type DispatchBoard,
} from '../data/dispatchBoardStore';
import { buildNetwork } from '../engine/network';
import { emptyProfile, loadProfile, saveProfile } from '../engine/progress';
import { careerScore, SHIFT_MS, startCareer, type CareerState } from '../engine/dispatch';
import { judgeCareer, type DispatchJudgement } from '../engine/dispatchJudge';
import { OOS_CROWD_MS } from '../engine/dispatchBalance';
import {
  ERAS, eraFor, servedStations, STARTING_NETWORK, type Expansion, type Served,
} from '../engine/dispatchNetwork';
import { cloneSim, startShiftSim, type Dir, type Incident, type Train } from '../engine/dispatchSim';
import { visibleTargets } from '../engine/dispatchTargets';
import { replayDispatch, type DispatchEvidence } from '../engine/replay';
import { drive } from '../engine/dispatchDrive.testutil';
import { music, sound } from '../audio/sound';
import { DispatcherScreen } from './DispatcherScreen';
import { DispatchExpansion } from './DispatchExpansion';
import { DispatchSummary } from './DispatchSummary';
import { closureText, failureText } from './dispatchTips';
import { TypingInputProvider } from './TypingInputProvider';

// Pass-through spy: the screen's judged evidence is observed, never altered.
vi.mock('../engine/dispatchJudge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../engine/dispatchJudge')>();
  return { ...actual, judgeCareer: vi.fn(actual.judgeCareer) };
});
const judgeSpy = vi.mocked(judgeCareer);

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

const ALL_TIPS = ['start', 'incident', 'bunching', 'late', 'out-of-service', 'expansion'];
const seenTips = (ids: string[]) => saveProfile({ ...emptyProfile(), dispatchTipsSeen: ids });

/** Controls `performance.now`, which `runTick` reads. */
function fakeClock(start = 1_000) {
  const clock = { now: start };
  vi.spyOn(performance, 'now').mockImplementation(() => clock.now);
  return clock;
}

const signalLabels = () => screen.queryAllByTestId('dispatch-signal');
const labelFor = (name: string) => signalLabels().find((el) => el.textContent?.includes(name));

beforeEach(() => {
  localStorage.clear();
  judgeSpy.mockClear();
  // Tips are marked seen so they never interrupt; tip tests opt back in.
  seenTips(ALL_TIPS);
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

  it('a wrong key visibly stalls the typing line until the stall ends', async () => {
    const clock = fakeClock();
    renderShift(careerWith([waiting(1, 'KJ', 'Jelatek')]));
    const line = () => screen.getByTestId('dispatch-typing');
    const done = () => line().querySelectorAll('[data-state="done"]').length;
    type('J');
    expect(line().getAttribute('data-stalled')).toBeNull();
    expect(screen.queryByText('Wait…')).toBeNull();
    type('z');
    expect(line().getAttribute('data-stalled')).toBe('true');
    expect(screen.getByText('Wait…').getAttribute('role')).toBe('status');
    // A key inside the stall is dropped, and the line still says so.
    clock.now = 1_200;
    type('e');
    expect(done()).toBe(1);
    expect(line().getAttribute('data-stalled')).toBe('true');
    // Once the Shift clock passes the stall, the line is live again.
    clock.now = 1_700;
    await waitFor(() => expect(line().getAttribute('data-stalled')).toBeNull());
    expect(screen.queryByText('Wait…')).toBeNull();
    type('e');
    expect(done()).toBe(2);
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

  it('each Incident kind has its own glyph, on the map and on its card', () => {
    const initial = careerWith([waiting(1, 'KJ', 'Jelatek')]);
    initial.sim.incidents = [
      signalFault(),
      { id: 2, kind: 'train-fault', place: idOf('KLCC'), stations: [], line: 'KJ', train: 1, startedMs: 0, step: 0 },
      { id: 3, kind: 'crowd-surge', place: idOf('Ampang Park'), stations: [idOf('Ampang Park')],
        line: 'KJ', train: null, startedMs: 0, step: 0 },
    ];
    initial.sim.nextIncidentId = 4;
    renderShift(initial);
    const kinds = ['signal-fault', 'train-fault', 'crowd-surge'];
    const onMap = screen.getAllByTestId('dispatch-incident');
    const glyphs = kinds.map((kind) => {
      const group = onMap.find((g) => g.getAttribute('data-kind') === kind)!;
      const glyph = group.querySelector(`[data-icon="incident-${kind}"]`)!;
      expect(glyph).toBeTruthy();
      return glyph.getAttribute('d');
    });
    // Distinct shapes, not one shape in different colours.
    expect(new Set(glyphs).size).toBe(3);
    const cards = within(screen.getByRole('list', { name: 'Incidents' })).getAllByRole('listitem');
    for (const kind of kinds) {
      const card = cards.find((c) => c.getAttribute('data-kind') === kind)!;
      expect(card.querySelector(`[data-icon="incident-${kind}"]`)?.getAttribute('d')).toBe(glyphs[kinds.indexOf(kind)]);
    }
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

  it('End Career on the Expansion screen ends the Career as abandoned', () => {
    renderShift({ ...startCareer(net, 7), status: 'between', shift: 1, cleared: 1, startedAt: 1_000, stoppedAt: 2_000,
      history: [{ shift: 1, delivered: 40, calls: 10, onTimeCalls: 9, cleared: true }] });
    expect(screen.getByRole('region', { name: 'Expansion' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'End Career' }));
    const summary = screen.getByRole('region', { name: 'Career summary' });
    expect(screen.getByRole('heading', { name: 'Career ended' })).toBeTruthy();
    expect(screen.getByText("Ended early — an abandoned Career can't enter the leaderboard.")).toBeTruthy();
    expect(within(summary).getByText('Shifts cleared').nextElementSibling!.textContent).toBe('1');
    expect(within(summary).getByText('Delivered').nextElementSibling!.textContent).toBe('40');
    expect(judgeSpy).not.toHaveBeenCalled();
  });

  it('a complete network moves on to the next Shift', () => {
    renderShift({ ...startCareer(net, 7), status: 'between', cleared: 1, startedAt: 1_000, stoppedAt: 2_000, offers: [] });
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    expect(screen.getByRole('banner', { name: 'Shift' }).textContent).toMatch(/Shift 2/);
  });

  it('typing an Expansion name picks it, the map grows, and picker keys stay out of the Keylog', async () => {
    // A real Career: Shift 1 is played through the screen from a scripted
    // typist's inputs, so the judged evidence can replay end to end.
    const seed = 3;
    const { evidence: script } = drive({ seed, msPerKey: 200, limitMs: SHIFT_MS + 30_000 });
    const expand = script.actions.find((a) => a.a === 'expand');
    expect(expand).toBeTruthy();
    const clock = fakeClock(script.keylog.t0);
    renderShift(startCareer(net, seed));
    let at = script.keylog.t0;
    let next = 0;
    const replayActions = (i: number) => {
      for (; next < script.actions.length && script.actions[next]!.i === i && script.actions[next] !== expand; next++) {
        const a = script.actions[next]!;
        clock.now = a.t;
        if (a.a !== 'confirm' && a.a !== 'unlock') throw new Error(`unexpected ${a.a}`);
        press(a.a === 'confirm' ? 'Enter' : 'Backspace');
      }
    };
    for (let i = 0; i < expand!.i; i++) {
      replayActions(i);
      at += script.keylog.events[i]!.dt;
      clock.now = at;
      press(script.keylog.events[i]!.k);
    }
    replayActions(expand!.i);
    clock.now = expand!.t;
    // A non-printable key brings the Career up to the clock and is never logged.
    press('Shift');
    expect(screen.getByRole('region', { name: 'Expansion' })).toBeTruthy();
    const offerName = screen.getAllByRole('button').map((b) => b.querySelector('.dispatch-offer-name')?.textContent)
      .filter((n): n is string => !!n)[(expand as { pick: number }).pick]!;

    type(offerName);
    expect(screen.queryByRole('region', { name: 'Expansion' })).toBeNull();
    expect(screen.getByRole('banner', { name: 'Shift' }).textContent).toMatch(/Shift 2/);
    const texts = [...document.querySelectorAll('svg text')].map((t) => t.textContent);
    expect(texts).toContain(offerName);

    // Start Shift 2 with one key, then let it collapse untouched.
    const first = screen.getAllByTestId('dispatch-signal')[0]!.textContent!;
    clock.now = expand!.t + 1_000;
    type(first[0]!);
    clock.now += 30 * 60_000;
    type('q');
    expect(screen.getByRole('region', { name: 'Career summary' })).toBeTruthy();
    await waitFor(() => expect(judgeSpy).toHaveBeenCalled());
    expect(judgeSpy).toHaveBeenCalledTimes(1);
    const evidence = judgeSpy.mock.calls[0]![1];
    const shiftKeys = script.keylog.events.slice(0, expand!.i).map((e) => e.k);
    expect(evidence.keylog.events.map((e) => e.k)).toEqual([...shiftKeys, first[0]]);
    expect(evidence.actions.filter((a) => a.a === 'expand')).toHaveLength(1);
    const replayed = replayDispatch(net, evidence);
    expect(replayed).not.toBeNull();
    expect(replayed!.complete).toBe(true);
    expect(replayed!.cleared).toBe(1);
  }, 60_000);

  it('Enter on a focused End Career button does not end the Career', () => {
    renderShift(careerWith([waiting(1, 'KJ', 'Jelatek'), waiting(2, 'KJ', 'Pasar Seni')]));
    type('J');
    const end = screen.getByRole('button', { name: 'End Career' });
    end.focus();
    expect(fireEvent.keyDown(end, { key: 'Enter' })).toBe(false);
    expect(fireEvent.keyDown(end, { key: ' ' })).toBe(false);
    expect(screen.getByRole('banner', { name: 'Shift' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Career summary' })).toBeNull();
  });

  it('with the on-screen keyboard, Space still reaches the game so two-word names can be typed', () => {
    render(
      <TypingInputProvider enabled>
        <DispatcherScreen net={net} onExit={() => {}} onAgain={() => {}}
          initial={careerWith([waiting(1, 'KJ', 'Masjid Jamek'), waiting(2, 'KJ', 'Jelatek')])} />
      </TypingInputProvider>,
    );
    const input = screen.getByLabelText('Typing input for Station name') as HTMLInputElement;
    input.focus();
    const typeOnScreen = (text: string) => {
      for (const ch of text) {
        // The shield must leave the input's own keys alone, or the character never arrives.
        expect(fireEvent.keyDown(input, { key: ch })).toBe(true);
        input.value = ch;
        fireEvent.input(input);
      }
    };
    typeOnScreen('Masjid');
    expect(labelFor('Masjid Jamek')!.getAttribute('data-locked')).toBe('true');
    typeOnScreen(' Jamek');
    expect(labelFor('Masjid Jamek')).toBeUndefined();
    expect(labelFor('Jelatek')).toBeTruthy();
  });

  it('a Clear sounds even on the tick a Passenger is Delivered', () => {
    const clock = fakeClock();
    const delivered = vi.spyOn(sound, 'delivered').mockImplementation(() => {});
    const arrive = vi.spyOn(sound, 'arrive').mockImplementation(() => {});
    const klcc = idOf('KLCC');
    const arriving: Train = { ...waiting(2, 'KJ', 'KLCC'), stage: 'cleared', load: { [klcc]: 5 } };
    renderShift(careerWith([waiting(1, 'KJ', 'Jelatek'), arriving]));
    type('Jelate');
    expect(delivered).not.toHaveBeenCalled();
    clock.now += 100;
    type('k');
    expect(delivered).toHaveBeenCalled();
    expect(arrive).toHaveBeenCalled();
  });

  describe('tips', () => {
    it('shows the start tip inline until the first key', () => {
      seenTips([]);
      renderShift(careerWith([waiting(1, 'KJ', 'Jelatek')]));
      expect(screen.getByText("Type a waiting station's name to clear its signal. Trains you don't clear wait.")).toBeTruthy();
      type('J');
      expect(screen.queryByText(/Trains you don't clear wait/)).toBeNull();
      expect(loadProfile().dispatchTipsSeen).toContain('start');
    });

    it('a tip pauses the Career with the ordinary pause action, and any key resumes it', () => {
      seenTips(ALL_TIPS.filter((id) => id !== 'out-of-service'));
      const clock = fakeClock();
      const initial = careerWith([waiting(1, 'KJ', 'Jelatek'), waiting(2, 'KJ', 'Pasar Seni')]);
      initial.sim.platforms[idOf('KLCC')] = {
        waiting: { [idOf('KL Sentral')]: 200 }, fullMs: OOS_CROWD_MS - 100, lastCall: {},
      };
      renderShift(initial);
      type('J');
      clock.now += 100;
      type('e');
      const tip = screen.getByRole('dialog', { name: 'Tip' });
      expect(tip.textContent).toContain('A station is out of service.');
      expect(screen.queryByRole('dialog', { name: 'Paused' })).toBeNull();
      expect(loadProfile().dispatchTipsSeen).toContain('out-of-service');

      clock.now += 5_000;
      type('x');
      expect(screen.queryByRole('dialog', { name: 'Tip' })).toBeNull();
      expect(screen.queryByRole('dialog', { name: 'Paused' })).toBeNull();
      expect(screen.getByLabelText('Type Jelatek')).toBeTruthy();
      type('l');
      expect(labelFor('Jelatek')!.getAttribute('data-locked')).toBe('true');
    });

    it('the Expansion tip shows over the picker, and its dismissing key picks nothing', () => {
      seenTips(ALL_TIPS.filter((id) => id !== 'expansion'));
      const clock = fakeClock();
      const initial = careerWith([waiting(1, 'KJ', 'Jelatek')]);
      // A Career 100 ms short of the end of Shift 1.
      initial.gameMs = SHIFT_MS - 100;
      initial.sim.shiftMs = SHIFT_MS - 100;
      initial.startedAt = clock.now - initial.gameMs;
      renderShift(initial);
      type('J');
      clock.now += 100;
      type('e');
      expect(screen.getByRole('region', { name: 'Expansion' })).toBeTruthy();
      expect(screen.getByRole('dialog', { name: 'Tip' }).textContent).toContain('Shift cleared.');
      type('x');
      expect(screen.queryByRole('dialog', { name: 'Tip' })).toBeNull();
      expect(screen.getByRole('region', { name: 'Expansion' })).toBeTruthy();
    });
  });

  describe('the end of a Career', () => {
    it('a failed Career shows its summary before the judgement, then the result', async () => {
      const clock = fakeClock();
      renderShift(startCareer(net, 7));
      clock.now = 2_000;
      type('J');
      clock.now = 2_000 + 30 * 60_000;
      type('x');
      // The summary is on screen and says it is checking; the judge has not run yet.
      expect(screen.getByRole('region', { name: 'Career summary' })).toBeTruthy();
      expect(screen.getByRole('status').textContent).toBe('Checking your Career…');
      expect(judgeSpy).not.toHaveBeenCalled();
      await waitFor(() => expect(judgeSpy).toHaveBeenCalledTimes(1));
      expect(await screen.findByText(/wasn't eligible for the leaderboard/)).toBeTruthy();
      expect(screen.queryByText('Checking your Career…')).toBeNull();
    });

    it('a live failed Career is judged once, on evidence that replays complete', async () => {
      const clock = fakeClock();
      const initial = startCareer(net, 7);
      renderShift(initial);
      const first = visibleTargets(net, initial.sim)[0]!.text;
      clock.now = 2_000;
      type(first.slice(0, 2));
      // A key that lands after the failing tick ends the Career and is not recorded.
      clock.now = 2_000 + 30 * 60_000;
      type('x');
      expect(screen.getByRole('region', { name: 'Career summary' })).toBeTruthy();
      await waitFor(() => expect(judgeSpy).toHaveBeenCalled());
      expect(judgeSpy).toHaveBeenCalledTimes(1);
      const evidence: DispatchEvidence = judgeSpy.mock.calls[0]![1];
      expect(evidence.keylog.events.map((e) => e.k).join('')).toBe(first.slice(0, 2));
      const replayed = replayDispatch(net, evidence);
      expect(replayed).not.toBeNull();
      expect(replayed!.complete).toBe(true);
      // The summary leads with the first closure: what started the collapse.
      expect(screen.getByText(
        'Shift 1 ended: it started when Masjid Jamek went out of service after a train fault was left unfixed.',
      )).toBeTruthy();
    });

    it('an ineligible failed Career records an integrity fail for Dispatcher', async () => {
      const clock = fakeClock();
      renderShift(startCareer(net, 7));
      clock.now = 2_000;
      type('J');
      clock.now = 2_000 + 30 * 60_000;
      type('x');
      await waitFor(() => expect(judgeSpy).toHaveBeenCalled());
      expect(judgeSpy).toHaveBeenCalledTimes(1);
      expect(judgeSpy.mock.results[0]!.value.eligible).toBe(false);
      expect(loadProfile().integrityFails?.[0]?.mode).toBe('dispatch');
      expect(screen.getByText(/wasn't eligible for the leaderboard/)).toBeTruthy();
    });

    it('an abandoned Career ends early and is never judged', () => {
      renderShift(careerWith([waiting(1, 'KJ', 'Jelatek')]));
      type('J');
      fireEvent.click(screen.getByRole('button', { name: 'End Career' }));
      expect(screen.getByText("Ended early — an abandoned Career can't enter the leaderboard.")).toBeTruthy();
      expect(screen.queryByText('Checking your Career…')).toBeNull();
      expect(judgeSpy).not.toHaveBeenCalled();
      expect(loadProfile().integrityFails ?? []).toEqual([]);
    });
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

const offerAt = (line: LineCode, name: string): Expansion => {
  const id = idOf(name);
  const at = net.lines.get(line)!.stations.indexOf(id);
  return { line, from: Math.max(0, at - 2), to: at, farEnd: id, added: [id] };
};

describe('DispatchExpansion', () => {
  const between = (offers: Expansion[], cleared = 2): CareerState => ({
    ...startCareer(net, 7), status: 'between', cleared, startedAt: 1_000, stoppedAt: 2_000, offers,
  });
  const renderPicker = (career: CareerState, onPick = vi.fn()) => {
    render(
      <TypingInputProvider enabled={false}>
        <DispatchExpansion net={net} career={career} onPick={onPick} />
      </TypingInputProvider>,
    );
    return onPick;
  };
  const offers = [offerAt('AG', 'Ampang'), offerAt('KJ', 'Ampang Park'), offerAt('KJ', 'Gombak')];

  it("lists each offer's far-end Station and the Era", () => {
    const career = between(offers);
    renderPicker(career);
    const names = screen.getAllByRole('button').map((b) => b.querySelector('.dispatch-offer-name')?.textContent);
    expect(names).toEqual(['Ampang', 'Ampang Park', 'Gombak']);
    expect(screen.getByText(new RegExp(ERAS[eraFor(career.cleared)]!.label))).toBeTruthy();
  });

  it('typing a full name picks that offer', () => {
    const onPick = renderPicker(between(offers));
    type('Gomba');
    expect(onPick).not.toHaveBeenCalled();
    type('k');
    expect(onPick).toHaveBeenCalledWith(2);
  });

  it('narrows like Signals, and Enter picks an exact shorter name', () => {
    const onPick = renderPicker(between(offers));
    type('Ampang');
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByRole('note').textContent).toBe('Enter to choose Ampang');
    press('Enter');
    expect(onPick).toHaveBeenCalledWith(0);
  });

  it('a longer name still matches past the shorter one', () => {
    const onPick = renderPicker(between(offers));
    type('Ampang Park');
    expect(onPick).toHaveBeenCalledWith(1);
  });

  it('clicking an offer picks it', () => {
    const onPick = renderPicker(between(offers));
    fireEvent.click(screen.getByRole('button', { name: /Ampang Park/ }));
    expect(onPick).toHaveBeenCalledWith(1);
  });

  it('with no offers, the network is complete and Continue picks -1', () => {
    const onPick = renderPicker(between([]));
    expect(screen.getByText('Your network is complete')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    expect(onPick).toHaveBeenCalledWith(-1);
  });
});

describe('DispatchSummary', () => {
  const metrics = { wpm: 52.4, accuracy: 0.953, score: 47.6 };
  const failure = { shift: 2, closures: [
    { station: idOf('KLCC'), cause: 'signal-fault' as const },
    { station: idOf('Masjid Jamek'), cause: 'crowding' as const },
  ] };
  const served: Served = [{ line: 'KJ', from: 2, to: 17 }];
  const failed = (): CareerState => {
    const base = startCareer(net, 7);
    return {
      ...base, status: 'ended', endReason: 'failed', failure, startedAt: 0, endedAt: 400_000,
      shift: 2, cleared: 1, served, correctChars: 950, keystrokes: 1000, errors: 50,
      history: [
        { shift: 1, delivered: 300, calls: 100, onTimeCalls: 80, cleared: true },
        { shift: 2, delivered: 120, calls: 60, onTimeCalls: 40, cleared: false },
      ],
    };
  };
  const judgement = (over: Partial<DispatchJudgement> = {}): DispatchJudgement => ({
    eligible: true, score: 399, delivered: 420, cleared: 1, verdict: { ok: true }, ...over,
  });
  const renderSummary = (career: CareerState, j: DispatchJudgement | null) => render(
    <DispatchSummary net={net} career={career} metrics={metrics} judgement={j} onAgain={() => {}} onBack={() => {}} />,
  );
  const fullBoard = (score: number): DispatchBoard => {
    let board = loadDispatchBoard();
    for (let i = 0; i < 20; i++) {
      board = submitDispatchEntry(board, {
        name: `P${i}`, score, delivered: score, shifts: 3, metrics, playedAt: i, verified: true,
      }).board;
    }
    return board;
  };

  it('shows the score, Shifts cleared, network size, Delivered, on-time %, WPM, accuracy, cause and credit', () => {
    const career = failed();
    renderSummary(career, judgement());
    const stats = screen.getByRole('region', { name: 'Career summary' });
    const row = (label: string) => within(stats).getByText(label).nextElementSibling!.textContent;
    expect(row('Score')).toBe(String(careerScore(career)));
    expect(row('Shifts cleared')).toBe('1');
    expect(row('Network')).toBe(`${servedStations(net, served).length} Stations`);
    expect(row('Delivered')).toBe('420');
    expect(row('On time')).toBe('75%');
    expect(row('WPM')).toBe('52');
    expect(row('Accuracy')).toBe('95%');
    expect(screen.getByText(failureText(net, failure))).toBeTruthy();
    expect(failureText(net, failure)).toMatch(/it started when KLCC went out of service after a signal fault/);
    const closures = within(screen.getByRole('list', { name: 'Out of service, in order' })).getAllByRole('listitem');
    expect(closures.map((item) => item.textContent)).toEqual(failure.closures.map((c) => closureText(net, c)));
    expect(screen.getByText('Ridership estimates informed by data.gov.my (CC BY 4.0)')).toBeTruthy();
  });

  it('offers name entry only to an eligible Career that qualifies', () => {
    const { unmount } = renderSummary(failed(), judgement({ eligible: false, verdict: null }));
    expect(screen.queryByRole('textbox', { name: 'Your name' })).toBeNull();
    unmount();

    saveDispatchBoard(fullBoard(1_000));
    const second = renderSummary(failed(), judgement());
    expect(screen.queryByRole('textbox', { name: 'Your name' })).toBeNull();
    expect(screen.getByText(/Didn't make the leaderboard/)).toBeTruthy();
    second.unmount();

    localStorage.clear();
    renderSummary(failed(), judgement());
    expect(screen.getByRole('textbox', { name: 'Your name' })).toBeTruthy();
  });

  it('submitting a name lists the entry with its rank, verified', () => {
    saveDispatchBoard(submitDispatchEntry(loadDispatchBoard(), {
      name: 'Top', score: 1_000, delivered: 1_000, shifts: 5, metrics, playedAt: 1, verified: true,
    }).board);
    renderSummary(failed(), judgement());
    const input = screen.getByRole('textbox', { name: 'Your name' });
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.submit(input.closest('form')!);
    expect(loadDispatchBoard().entries).toHaveLength(1);

    fireEvent.change(input, { target: { value: ' Aina ' } });
    fireEvent.submit(input.closest('form')!);
    expect(screen.getByRole('status').textContent).toMatch(/#2/);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[1]!.textContent).toContain('Aina');
    expect(rows[1]!.textContent).toContain('399');
    const saved = loadDispatchBoard().entries.find((e) => e.name === 'Aina')!;
    expect(saved).toMatchObject({ score: 399, delivered: 420, shifts: 1, verified: true });
  });

  it('a rapid double submit saves the entry once', () => {
    renderSummary(failed(), judgement());
    const input = screen.getByRole('textbox', { name: 'Your name' });
    fireEvent.change(input, { target: { value: 'Aina' } });
    const form = input.closest('form')!;
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    // React 18 flushes between two native submits, so the handler is called
    // twice directly: two submits that land before React re-renders.
    const propsKey = Object.keys(form).find((k) => k.startsWith('__reactProps$'))!;
    const { onSubmit } = (form as unknown as Record<string, { onSubmit: (e: { preventDefault: () => void }) => void }>)[propsKey]!;
    act(() => {
      onSubmit({ preventDefault: () => {} });
      onSubmit({ preventDefault: () => {} });
    });
    expect(setItem.mock.calls.filter(([k]) => k === DISPATCH_BOARD_KEY)).toHaveLength(1);
    expect(loadDispatchBoard().entries.filter((e) => e.name === 'Aina')).toHaveLength(1);
  });

  it('a failed Career says it is checking until its judgement arrives', () => {
    const { rerender } = renderSummary(failed(), null);
    expect(screen.getByRole('status').textContent).toBe('Checking your Career…');
    expect(screen.queryByRole('textbox', { name: 'Your name' })).toBeNull();
    rerender(<DispatchSummary net={net} career={failed()} metrics={metrics} judgement={judgement()}
      onAgain={() => {}} onBack={() => {}} />);
    expect(screen.queryByText('Checking your Career…')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Your name' })).toBeTruthy();
  });

  it('an abandoned Career ends early', () => {
    renderSummary({ ...failed(), endReason: 'abandoned', failure: null }, null);
    expect(screen.queryByText('Checking your Career…')).toBeNull();
    expect(screen.getByText("Ended early — an abandoned Career can't enter the leaderboard.")).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Your name' })).toBeNull();
  });
});
