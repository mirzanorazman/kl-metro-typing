import { StrictMode } from 'react';
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
import { GAP_TRIGGER_MS, INCIDENT_LIMIT_MS, LATE_FACTOR, OOS_CROWD_MS, TICK_MS, TRAVEL_MS } from '../engine/dispatchBalance';
import {
  applyExpansion, ERAS, eraFor, servedLines, servedStations, STARTING_NETWORK, type Expansion, type Served,
} from '../engine/dispatchNetwork';
import { cloneSim, startShiftSim, targetHeadwayMs, type Dir, type Incident, type Train } from '../engine/dispatchSim';
import { visibleTargets } from '../engine/dispatchTargets';
import * as lessonEngine from '../engine/dispatchLesson';
import { replayDispatch, type DispatchEvidence } from '../engine/replay';
import { drive } from '../engine/dispatchDrive.testutil';
import { music, sound } from '../audio/sound';
import { DispatcherScreen } from './DispatcherScreen';
import { DispatchExpansion } from './DispatchExpansion';
import { DispatchSummary } from './DispatchSummary';
import { ClosureGauge, closureBand } from './ClosureGauge';
import { closureText, failureText } from './dispatchTips';
import { END_CONFIRM_MS } from './ConfirmEndButton';
import { TypingInputProvider } from './TypingInputProvider';
import { DISPATCH_CAMERA_KEY } from './useCloseCamera';
import { CLOSE_CAMERA_DEFAULTS, type CloseCameraSettings } from './dispatchCamera';
import { fitViewBox } from '../geo/fit';
import { DISPATCH_FIT_PADDING } from '../render/dispatchLayout';
import { liveMarks, RIPPLE_LEAD_MS, RIPPLE_STEP_MS } from '../render/useSignalMarks';
import { MapCanvas } from '../render/MapCanvas';
import { DispatchOverlay } from '../render/DispatchOverlay';
import { chipBox, hits, layoutPops, overlayLayout, popBox } from '../render/dispatchLayout';
import type { ExchangePop } from '../render/usePassengerMoments';
import { networkLayout } from '../geo/networkLayout';
import { trackLines } from '../render/mapMarks';
import { readFileSync } from 'node:fs';

// Pass-through spy: the screen's judged evidence is observed, never altered.
vi.mock('../engine/dispatchJudge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../engine/dispatchJudge')>();
  return { ...actual, judgeCareer: vi.fn(actual.judgeCareer) };
});
const judgeSpy = vi.mocked(judgeCareer);

// Pass-through spy: the map's framing props are observed, the map still renders.
vi.mock('../render/MapCanvas', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../render/MapCanvas')>();
  return { ...actual, MapCanvas: vi.fn(actual.MapCanvas) };
});
const mapSpy = vi.mocked(MapCanvas);
const mapProps = () => mapSpy.mock.lastCall![0];

// Pass-through spy: stale and refused picks exercise the screen's engine boundary.
vi.mock('./DispatchExpansion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./DispatchExpansion')>();
  return { ...actual, DispatchExpansion: vi.fn(actual.DispatchExpansion) };
});
const expansionSpy = vi.mocked(DispatchExpansion);

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
  return { id, line, dir, at, stage: 'signal', ms: 0, skipTo: null, load: {}, lastExchange: null };
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
    line: 'KJ', train: null, startedMs: 0, step: 0, extra: 0,
  };
}

const renderShift = (initial?: CareerState) => render(
  <TypingInputProvider enabled={false}>
    <DispatcherScreen net={net} onExit={() => {}} onAgain={() => {}} initial={initial} />
  </TypingInputProvider>,
);

const START_TIP = "Every red signal on your Line is a train waiting for you. Trains you don't clear wait. Type any waiting Station's name to start your first Shift.";
const ALL_TIPS = ['lesson', 'start', 'incident', 'service-gap', 'late', 'new-train', 'out-of-service', 'expansion'];
const seenTips = (ids: string[]) => saveProfile({ ...emptyProfile(), dispatchTipsSeen: ids });
/** A profile that has seen every tip but the lesson and the start caption. */
const fresh = () => seenTips(ALL_TIPS.filter((id) => id !== 'lesson' && id !== 'start'));
/** The screen as a first-time player opens it: no Career passed in, the seed fixed. */
const renderLesson = (onExit = () => {}, seed = 7) => render(
  <TypingInputProvider enabled={false}>
    <DispatcherScreen net={net} onExit={onExit} onAgain={() => {}} lessonFor={{ seed }} />
  </TypingInputProvider>,
);

/** Motion allowed: only the reduced-motion query is false. */
const allowMotion = () => {
  window.matchMedia = ((q: string) => ({
    matches: q !== '(prefers-reduced-motion: reduce)', media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
};

/** The dev camera panel's close camera, switched on before the screen renders. */
const closeCameraOn = (over: Partial<CloseCameraSettings> = {}) =>
  localStorage.setItem(DISPATCH_CAMERA_KEY, JSON.stringify({ ...CLOSE_CAMERA_DEFAULTS, on: true, ...over }));
/** The normal frame of a Served network, as the screen fits it. */
const normalBox = (served: Served) => fitViewBox(
  servedStations(net, served).map((id) => mapProps().layout.get(id)!), DISPATCH_FIT_PADDING);

/** Controls `performance.now`, which `runTick` reads. */
function fakeClock(start = 1_000) {
  const clock = { now: start };
  vi.spyOn(performance, 'now').mockImplementation(() => clock.now);
  return clock;
}

/** End Career asks first: the click opens the question, "Yes, end it" answers it. */
const endCareer = () => {
  fireEvent.click(screen.getByRole('button', { name: 'End Career' }));
  fireEvent.click(screen.getByRole('button', { name: 'Yes, end it' }));
};

/** KLCC overflows on the first tick after the Shift starts; `closed` are already Out of service. */
function closingCareer(closed: string[] = []): CareerState {
  const initial = careerWith([waiting(1, 'KJ', 'Jelatek'), waiting(2, 'KJ', 'Pasar Seni')]);
  initial.sim.platforms[idOf('KLCC')] = {
    waiting: { [idOf('KL Sentral')]: 200 }, fullMs: OOS_CROWD_MS - 100, lastCall: {},
  };
  for (const name of closed) {
    initial.sim.outOfService[idOf(name)] = 'crowding';
    initial.sim.oosOrder.push(idOf(name));
  }
  return initial;
}
/** Starts the Shift and lets 1 s pass: KLCC closes. */
const closeKlcc = (clock: { now: number }) => { type('J'); clock.now += 1_000; type('e'); };
const gauge = () => screen.queryByRole('progressbar', { name: 'Stations closed' });

const signalLabels = () => screen.queryAllByTestId('dispatch-signal');
const labelFor = (name: string) => signalLabels().find((el) => el.textContent?.includes(name));

beforeEach(() => {
  localStorage.clear();
  judgeSpy.mockClear();
  vi.spyOn(sound, 'lineOpen').mockImplementation(() => {});
  // Tips are marked seen so they never interrupt; tip tests opt back in.
  seenTips(ALL_TIPS);
  // The close camera is on by default; most tests pin the camera underneath it,
  // so they start with it switched off. Close camera tests switch it on.
  localStorage.setItem(DISPATCH_CAMERA_KEY, JSON.stringify({ ...CLOSE_CAMERA_DEFAULTS, on: false }));
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

  it('passes the Career served ranges to the map', () => {
    const initial = careerWith([], [{ line: 'KJ', from: 2, to: 17 }, { line: 'AG', from: 10, to: 12 }]);
    renderShift(initial);
    expect(mapProps().emphasisRanges).toEqual(initial.served);
    expect(mapProps().emphasisSet).toBeUndefined();
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

  it('before the first key, Esc or Back to map leaves without ending a Career', () => {
    const onExit = vi.fn();
    const view = render(
      <TypingInputProvider enabled={false}>
        <DispatcherScreen net={net} onExit={onExit} onAgain={() => {}} initial={careerWith([waiting(1, 'KJ', 'Jelatek')])} />
      </TypingInputProvider>,
    );
    expect(screen.queryByRole('button', { name: 'End Career' })).toBeNull();
    press('Escape');
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: 'Paused' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Back to map/ }));
    expect(onExit).toHaveBeenCalledTimes(2);
    view.unmount();

    // Once the Shift starts, Back to map gives way to End Career.
    renderShift(careerWith([waiting(1, 'KJ', 'Jelatek')]));
    type('J');
    expect(screen.queryByRole('button', { name: /Back to map/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'End Career' })).toBeTruthy();
  });

  it('waiting to start a later Shift is still mid-Career: End Career, and Esc does not leave', () => {
    const onExit = vi.fn();
    render(
      <TypingInputProvider enabled={false}>
        <DispatcherScreen net={net} onExit={onExit} onAgain={() => {}}
          initial={{ ...careerWith([waiting(1, 'KJ', 'Jelatek')]), shift: 2, cleared: 1, startedAt: 1_000, stoppedAt: 2_000 }} />
      </TypingInputProvider>,
    );
    press('Escape');
    expect(onExit).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Back to map/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'End Career' })).toBeTruthy();
  });

  it('reaching for Backspace after a wrong key keeps the name typed so far', () => {
    renderShift(careerWith([waiting(1, 'KJ', 'Jelatek'), waiting(2, 'KJ', 'Pasar Seni')]));
    type('Je#');
    expect(screen.getByText('Wrong key')).toBeTruthy();
    press('Backspace');
    expect(screen.queryByText('Wrong key')).toBeNull();
    expect(labelFor('Jelatek')!.getAttribute('data-locked')).toBe('true');
    expect(screen.getByLabelText('Type Jelatek')).toBeTruthy();
  });

  it('Backspace takes back a letter and lets go at the last; Escape pauses, and Enter resumes', () => {
    renderShift(careerWith([waiting(1, 'KJ', 'Jelatek'), waiting(2, 'KJ', 'Pasar Seni')]));
    type('Je');
    expect(screen.getByLabelText('Type Jelatek')).toBeTruthy();
    expect(labelFor('Jelatek')!.getAttribute('data-locked')).toBe('true');
    press('Backspace');
    expect(labelFor('Jelatek')!.getAttribute('data-locked')).toBe('true');
    expect(screen.getByText('Backspace', { selector: 'kbd' }).parentElement!.textContent).toMatch(/Backspace to undo/);
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
      { id: 2, kind: 'train-fault', place: idOf('KLCC'), stations: [], line: 'KJ', train: 1, startedMs: 0, step: 0, extra: 0 },
      { id: 3, kind: 'crowd-surge', place: idOf('Ampang Park'), stations: [idOf('Ampang Park')],
        line: 'KJ', train: null, startedMs: 0, step: 0, extra: 0 },
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

  it('music: calm while running, tense while any Incident is active', () => {
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

  it('music returns to calm once a missed Incident leaves a Station Out of service and no Incident remains', () => {
    const play = vi.spyOn(music, 'play').mockImplementation(() => {});
    vi.spyOn(music, 'stop').mockImplementation(() => {});
    const initial = careerWith([waiting(1, 'KJ', 'Jelatek')]);
    initial.sim.incidents = [signalFault()];
    const view = renderShift(initial);
    type('J');
    expect(play).toHaveBeenLastCalledWith('rushTense');
    view.unmount();

    const after = careerWith([waiting(1, 'KJ', 'Jelatek')]);
    after.sim.outOfService = { [idOf('Masjid Jamek')]: 'signal-fault' };
    renderShift(after);
    type('J');
    expect(play).toHaveBeenLastCalledWith('rushCalm');
  });

  it('End Career on the Expansion screen retires the Career, keeping what it cleared', () => {
    renderShift({ ...startCareer(net, 7), status: 'between', shift: 1, cleared: 1, startedAt: 1_000, stoppedAt: 2_000,
      history: [{ shift: 1, delivered: 40, calls: 10, onTimeCalls: 9, cleared: true }] });
    expect(screen.getByRole('region', { name: 'Expansion' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'End Career' }));
    expect(screen.getByText('Your Career will be ranked.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, end it' }));
    const summary = screen.getByRole('region', { name: 'Career summary' });
    expect(screen.getByRole('heading', { name: 'Career retired' })).toBeTruthy();
    expect(within(summary).getByText('Shifts cleared').nextElementSibling!.textContent).toBe('1');
    expect(within(summary).getByText('Delivered').nextElementSibling!.textContent).toBe('40');
  });

  it('top bar counts the Lines and Stations in service', () => {
    renderShift(careerWith([waiting(1, 'KJ', 'Jelatek')]));
    const bar = screen.getByRole('banner', { name: 'Shift' });
    const stat = (label: string) => within(bar).getByText(label).nextElementSibling!.textContent;
    expect(stat('Lines')).toBe(String(servedLines(STARTING_NETWORK).length));
    expect(stat('Stations')).toBe(String(servedStations(net, STARTING_NETWORK).length));
    expect(bar.querySelector('.dispatch-grown')).toBeNull();
  });

  it('after an Expansion the bar shows what grew, until the Shift starts', () => {
    allowMotion();
    const clock = fakeClock();
    const offer = offerAt('AG', 'Ampang');
    renderShift({ ...startCareer(net, 7), status: 'between', shift: 1, cleared: 1, startedAt: 1_000, stoppedAt: 2_000,
      offers: [offer], history: [{ shift: 1, delivered: 40, calls: 10, onTimeCalls: 9, cleared: true }] });
    const before = servedStations(net, STARTING_NETWORK).length;
    const after = applyExpansion(STARTING_NETWORK, offer);
    expect(screen.getByText(`Network: ${servedLines(STARTING_NETWORK).length} Line · ${before} Stations`)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Ampang/ }));
    const bar = screen.getByRole('banner', { name: 'Shift' });
    const stat = (label: string) => within(bar).getByText(label).nextElementSibling as HTMLElement;
    expect(stat('Lines').textContent).toBe(`${servedLines(after).length}+1`);
    expect(stat('Stations').textContent).toBe(`${servedStations(net, after).length}+${servedStations(net, after).length - before}`);
    expect(within(stat('Stations')).getByLabelText(`${servedStations(net, after).length - before} new`)).toBeTruthy();
    clock.now += 800;
    type(screen.getAllByTestId('dispatch-signal')[0]!.textContent![0]!);
    expect(bar.querySelector('.dispatch-grown')).toBeNull();
  });

  it('a complete network moves on to the next Shift', () => {
    renderShift({ ...startCareer(net, 7), status: 'between', cleared: 1, startedAt: 1_000, stoppedAt: 2_000, offers: [] });
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    expect(screen.getByRole('banner', { name: 'Shift' }).textContent).toMatch(/Shift 2/);
  });

  /**
   * A real Career: Shift 1 is played through the screen from a scripted
   * typist's inputs, up to the Expansion screen, so the judged evidence can
   * replay end to end.
   */
  const playShiftOne = () => {
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
        if (a.a !== 'confirm' && a.a !== 'backspace') throw new Error(`unexpected ${a.a}`);
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
    return { clock, script, expand: expand! };
  };

  it('ending a Career on the Expansion screen retires it: judged, and it can enter the leaderboard', async () => {
    const { script, expand } = playShiftOne();
    endCareer();
    expect(screen.getByRole('heading', { name: 'Career retired' })).toBeTruthy();
    expect(screen.queryByText(/abandoned Career/)).toBeNull();
    await waitFor(() => expect(judgeSpy).toHaveBeenCalled());
    expect(judgeSpy).toHaveBeenCalledTimes(1);
    const evidence = judgeSpy.mock.calls[0]![1];
    expect(evidence.keylog.events.map((e) => e.k)).toEqual(script.keylog.events.slice(0, expand.i).map((e) => e.k));
    expect(evidence.actions[evidence.actions.length - 1]!.a).toBe('abandon');
    // jsdom's keys are never trusted, so the live verdict can't pass here; the
    // replay is what decides, and the summary test shows the board entry.
    const replayed = replayDispatch(net, evidence)!;
    expect(replayed.complete).toBe(true);
    expect(replayed.cleared).toBe(1);
    expect(await screen.findByText("This Career wasn't eligible for the leaderboard.")).toBeTruthy();
  }, 60_000);

  it('typing an Expansion name picks it, the map grows, and picker keys stay out of the Keylog', async () => {
    allowMotion();
    const { clock, script, expand } = playShiftOne();
    const offerName = screen.getAllByRole('button').map((b) => b.querySelector('.dispatch-offer-name')?.textContent)
      .filter((n): n is string => !!n)[(expand as { pick: number }).pick]!;

    type(offerName);
    expect(screen.queryByRole('region', { name: 'Expansion' })).toBeNull();
    expect(screen.getByRole('banner', { name: 'Shift' }).textContent).toMatch(/Shift 2/);
    const texts = [...document.querySelectorAll('svg text')].map((t) => t.textContent);
    expect(texts).toContain(offerName);

    // Start Shift 2 with one key, then let it collapse untouched.
    const first = screen.getAllByTestId('dispatch-signal')[0]!.textContent!;
    clock.now = expand.t + 1_000;
    type(first[0]!);
    clock.now += 30 * 60_000;
    type('q');
    expect(screen.getByRole('region', { name: 'Career summary' })).toBeTruthy();
    await waitFor(() => expect(judgeSpy).toHaveBeenCalled());
    expect(judgeSpy).toHaveBeenCalledTimes(1);
    const evidence = judgeSpy.mock.calls[0]![1];
    const shiftKeys = script.keylog.events.slice(0, expand.i).map((e) => e.k);
    expect(evidence.keylog.events.map((e) => e.k)).toEqual([...shiftKeys, first[0]]);
    expect(evidence.actions.filter((a) => a.a === 'expand')).toHaveLength(1);
    const replayed = replayDispatch(net, evidence);
    expect(replayed).not.toBeNull();
    expect(replayed!.complete).toBe(true);
    expect(replayed!.cleared).toBe(1);
  }, 60_000);

  describe('Expansion reveals', () => {
    beforeEach(() => { allowMotion(); vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });
    const between = (offers: Expansion[], served: Served = STARTING_NETWORK): CareerState => ({
      ...startCareer(net, 7), served, status: 'between', cleared: 1,
      startedAt: 1000, stoppedAt: 2000, offers,
    });
    const pick = () => fireEvent.click(screen.getByRole('button', { name: /Ampang/ }));

    it('installs the reveal before a subsequent key and keeps notice and growth until an accepted Shift key', () => {
      seenTips(ALL_TIPS.filter((id) => id !== 'start'));
      const clock = fakeClock();
      renderShift(between([offerAt('AG', 'Ampang')]));
      act(() => { pick(); type('x'); });
      expect(mapProps().trackReveal).toMatchObject({ before: STARTING_NETWORK, duration: 800 });
      expect(screen.getByRole('status', { name: 'New Line' }).textContent).toContain('joins the network');
      expect(sound.lineOpen).toHaveBeenCalledTimes(1);
      const left = document.querySelector('.dispatch-left')!.textContent;
      clock.now += 799;
      act(() => vi.advanceTimersByTime(799));
      for (const key of ['x', ' ', 'Enter', 'Backspace']) press(key);
      expect(document.querySelector('.dispatch-left')!.textContent).toBe(left);
      expect(loadProfile().dispatchTipsSeen).not.toContain('start');
      expect(screen.queryByTestId('dispatch-typing')).toBeNull();
      clock.now += 1;
      act(() => vi.advanceTimersByTime(1));
      expect(mapProps().trackReveal).toBeNull();
      expect(screen.getByRole('status', { name: 'New Line' })).toBeTruthy();
      press('Backspace');
      expect(screen.getByRole('status', { name: 'New Line' })).toBeTruthy();
      expect(document.querySelectorAll('.dispatch-grown').length).toBeGreaterThan(0);
      type(screen.getAllByTestId('dispatch-signal')[0]!.textContent![0]!);
      expect(screen.queryByRole('status', { name: 'New Line' })).toBeNull();
      expect(document.querySelectorAll('.dispatch-grown')).toHaveLength(0);
      expect(loadProfile().dispatchTipsSeen).toContain('start');
      expect(sound.lineOpen).toHaveBeenCalledTimes(1);
    });

    it('ignores the immediate letter following a typed choice, including in a phone input burst', () => {
      const clock = fakeClock();
      render(<TypingInputProvider enabled>
        <DispatcherScreen net={net} onExit={() => {}} onAgain={() => {}}
          initial={between([offerAt('AG', 'Ampang')])} />
      </TypingInputProvider>);
      const input = screen.getByRole('textbox', { name: 'Typing input for Station name' });
      fireEvent.input(input, { target: { value: 'Ampangx' } });
      expect(mapProps().trackReveal?.duration).toBe(800);
      expect(screen.queryByTestId('dispatch-typing')).toBeNull();
      clock.now += 800;
      act(() => vi.advanceTimersByTime(800));
      expect(document.querySelectorAll('.prompt [data-state="done"]')).toHaveLength(0);
      expect(sound.lineOpen).toHaveBeenCalledTimes(1);
    });

    it('reveals an extension without a new-Line notice or cue', () => {
      fakeClock();
      renderShift(between([offerAt('KJ', 'Gombak')]));
      fireEvent.click(screen.getByRole('button', { name: /Gombak/ }));
      expect(mapProps().trackReveal?.segments.length).toBeGreaterThan(0);
      expect(screen.queryByRole('status', { name: 'New Line' })).toBeNull();
      expect(sound.lineOpen).not.toHaveBeenCalled();
    });

    it('celebrates a shared-track Line with +1 Line, no new Station and no Station pop', () => {
      fakeClock();
      const served: Served = [{ line: 'AG', from: 0, to: 5 }];
      const stations = net.lines.get('SP')!.stations;
      const offer: Expansion = { line: 'SP', from: 0, to: 5, farEnd: stations[5]!, added: [] };
      renderShift(between([offer], served));
      fireEvent.click(screen.getByRole('button', { name: /Shared track/ }));
      expect(mapProps().trackReveal?.segments).toEqual([{ line: 'SP', from: 0, to: 5, reverse: false }]);
      expect(mapProps().trackReveal?.stations.size).toBe(0);
      const bar = screen.getByRole('banner', { name: 'Shift' });
      expect(within(bar).getByText('Lines').nextElementSibling!.textContent).toBe('2+1');
      expect(within(bar).getByText('Stations').nextElementSibling!.textContent).toBe('6');
      expect(screen.getByRole('status', { name: 'New Line' }).textContent).toContain(net.lines.get('SP')!.name);
      expect(sound.lineOpen).toHaveBeenCalledTimes(1);
    });

    it('Continue and an accepted no-op choice do not reveal, lock input, or celebrate', () => {
      fakeClock();
      const view = renderShift(between([]));
      fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
      expect(mapProps().trackReveal).toBeNull();
      expect(screen.queryByRole('status', { name: 'New Line' })).toBeNull();
      expect(screen.getByTestId('dispatch-typing')).toBeTruthy();
      expect(sound.lineOpen).not.toHaveBeenCalled();
      endCareer();
      act(() => vi.advanceTimersByTime(2000));
      expect(judgeSpy.mock.calls[0]![1].actions.map((action) => action.a)).toEqual(['expand', 'abandon']);
      view.unmount();
      const existing: Expansion = { ...offerAt('KJ', 'Ampang Park'), from: 4, to: 8 };
      renderShift(between([existing]));
      fireEvent.click(screen.getByRole('button', { name: /Ampang Park/ }));
      expect(mapProps().trackReveal).toBeNull();
      expect(sound.lineOpen).not.toHaveBeenCalled();
    });

    it('refused and stale picker actions never create another reveal or cue', () => {
      const clock = fakeClock();
      renderShift(between([offerAt('AG', 'Ampang')]));
      const onPick = expansionSpy.mock.lastCall![0].onPick;
      act(() => onPick(999));
      expect(screen.getByRole('region', { name: 'Expansion' })).toBeTruthy();
      expect(mapProps().trackReveal).toBeNull();
      expect(sound.lineOpen).not.toHaveBeenCalled();
      pick();
      const reveal = mapProps().trackReveal;
      act(() => onPick(0));
      expect(mapProps().trackReveal).toBe(reveal);
      clock.now += 800;
      act(() => vi.advanceTimersByTime(800));
      act(() => onPick(0));
      expect(mapProps().trackReveal).toBeNull();
      expect(sound.lineOpen).toHaveBeenCalledTimes(1);
    });

    it('reduced motion keeps one notice and cue without a reveal or lock', () => {
      window.matchMedia = ((q: string) => ({ matches: true, media: q,
        addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
      fakeClock();
      renderShift(between([offerAt('AG', 'Ampang')]));
      pick();
      expect(mapProps().trackReveal).toBeNull();
      expect(screen.getByRole('status', { name: 'New Line' })).toBeTruthy();
      expect(sound.lineOpen).toHaveBeenCalledTimes(1);
      type(screen.getAllByTestId('dispatch-signal')[0]!.textContent![0]!);
      expect(screen.queryByRole('status', { name: 'New Line' })).toBeNull();
    });

    it('StrictMode, rerenders, resize and pause do not replay a Line cue', () => {
      const clock = fakeClock();
      const initial = between([offerAt('AG', 'Ampang')]);
      const tree = () => <StrictMode><TypingInputProvider enabled={false}>
        <DispatcherScreen net={net} onExit={() => {}} onAgain={() => {}} initial={initial} />
      </TypingInputProvider></StrictMode>;
      const view = render(tree());
      pick();
      view.rerender(tree());
      act(() => { window.dispatchEvent(new Event('resize')); window.dispatchEvent(new Event('blur')); });
      clock.now += 800;
      act(() => vi.advanceTimersByTime(800));
      press('Escape');
      expect(sound.lineOpen).toHaveBeenCalledTimes(1);
      type(screen.getAllByTestId('dispatch-signal')[0]!.textContent![0]!);
      press('Escape'); press('Enter');
      expect(sound.lineOpen).toHaveBeenCalledTimes(1);
    });

    it('consumes a hidden Line cue without replaying it when visible', () => {
      const clock = fakeClock();
      const visible = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
      renderShift(between([offerAt('AG', 'Ampang')]));
      pick();
      expect(screen.getByRole('status', { name: 'New Line' })).toBeTruthy();
      expect(sound.lineOpen).not.toHaveBeenCalled();
      visible.mockReturnValue('visible');
      act(() => document.dispatchEvent(new Event('visibilitychange')));
      clock.now += 800;
      act(() => vi.advanceTimersByTime(800));
      expect(sound.lineOpen).not.toHaveBeenCalled();
    });

    it('drops reveal keys from real judged evidence and retires cleanly during the reveal', () => {
      const { clock, script, expand } = playShiftOne();
      const choice = screen.getAllByRole('button').find((b) => b.querySelector('.dispatch-offer-name'))!;
      fireEvent.click(choice);
      expect(mapProps().trackReveal?.duration).toBe(800);
      clock.now += 799;
      for (const key of ['x', ' ', 'Enter', 'Backspace']) press(key);
      endCareer();
      expect(screen.getByRole('heading', { name: 'Career retired' })).toBeTruthy();
      clock.now += 2000;
      act(() => vi.advanceTimersByTime(2000));
      expect(judgeSpy).toHaveBeenCalledTimes(1);
      const evidence = judgeSpy.mock.calls[0]![1];
      expect(evidence.keylog.events.map((event) => event.k)).toEqual(script.keylog.events.slice(0, expand.i).map((event) => event.k));
      expect(evidence.actions.filter((action) => action.a === 'expand')).toHaveLength(1);
      expect(evidence.actions[evidence.actions.length - 1]!.a).toBe('abandon');
      expect(replayDispatch(net, evidence)!.complete).toBe(true);
      expect(screen.queryByText('Opening the network…')).toBeNull();
      expect(screen.queryByRole('status', { name: 'New Line' })).toBeNull();
    }, 60_000);
  });

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

  it('a Clear sounds on the tick a Passenger is Delivered, with no stray delivered chime', () => {
    const clock = fakeClock();
    const delivered = vi.spyOn(sound, 'delivered').mockImplementation(() => {});
    const arrive = vi.spyOn(sound, 'arrive').mockImplementation(() => {});
    const klcc = idOf('KLCC');
    const arriving: Train = { ...waiting(2, 'KJ', 'KLCC'), stage: 'cleared', load: { [klcc]: 5 } };
    renderShift(careerWith([waiting(1, 'KJ', 'Jelatek'), arriving]));
    type('Jelate');
    clock.now += 100;
    type('k');
    expect(arrive).toHaveBeenCalled();
    expect(delivered).not.toHaveBeenCalled();
  });

  describe('tips', () => {
    it('shows the start tip inline until the first key', () => {
      seenTips([]);
      renderShift(careerWith([waiting(1, 'KJ', 'Jelatek')]));
      expect(screen.getByText(START_TIP)).toBeTruthy();
      type('J');
      expect(screen.queryByText(/Trains you don't clear wait/)).toBeNull();
      expect(loadProfile().dispatchTipsSeen).toContain('start');
    });

    it('the out-of-service tip points at the closed Station and its neighbours, close with the close camera', () => {
      allowMotion();
      closeCameraOn();
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
      expect(screen.getByRole('dialog', { name: 'Tip' }).textContent).toContain('A station is out of service.');
      expect(mapProps().fitKey).toMatch(/^tip:out-of-service:close:/);
      expect(mapProps().fitView!.w).toBeLessThan(normalBox(initial.served).w);
      const kj = net.lines.get('KJ')!.stations;
      const i = kj.indexOf(idOf('KLCC'));
      for (const id of [kj[i - 1]!, kj[i]!, kj[i + 1]!]) expect(mapProps().fitTo).toContainEqual(mapProps().layout.get(id));
    });

    it('a tip ignores the keys of a Station name; only Enter dismisses it', () => {
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
      expect(within(tip).getByRole('button').textContent).toBe('Enter Got it');
      type('Pasar Seni');
      press('Escape');
      expect(screen.getByRole('dialog', { name: 'Tip' })).toBeTruthy();
      press('Enter');
      expect(screen.queryByRole('dialog', { name: 'Tip' })).toBeNull();
      expect(screen.getByLabelText('Type Jelatek')).toBeTruthy();
    });

    it('a tip pauses the Career with the ordinary pause action, and Enter resumes it', () => {
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
      expect(tip.textContent).toContain('Each closure fills the gauge at the top');
      expect(screen.queryByRole('dialog', { name: 'Paused' })).toBeNull();
      expect(loadProfile().dispatchTipsSeen).toContain('out-of-service');

      clock.now += 5_000;
      press('Enter');
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
      press('Enter');
      expect(screen.queryByRole('dialog', { name: 'Tip' })).toBeNull();
      expect(screen.getByRole('region', { name: 'Expansion' })).toBeTruthy();
    });

    describe('pointing at their trains', () => {
      const REAR = 1;
      const LEADER = 2;
      /** A pair bunched for all but one tick: the Shift's first tick starts its Service gap. */
      const gapCareer = () => {
        const initial = careerWith([waiting(REAR, 'KJ', 'Kampung Baru'), waiting(LEADER, 'KJ', 'Dang Wangi')]);
        initial.sim.pairs = { [`${REAR}:${LEADER}`]: initial.sim.shiftMs + TICK_MS - GAP_TRIGGER_MS };
        return initial;
      };
      const trainEl = (id: number) => screen.getAllByTestId('dispatch-train')
        .find((el) => el.getAttribute('data-train') === String(id))!;
      /** Starts the Shift and lets one tick pass. */
      const oneTick = (clock: { now: number }) => { type('D'); clock.now += TICK_MS; type('a'); };

      it('a Service gap tip frames its pair and pulses both trains while it shows', () => {
        allowMotion();
        seenTips(ALL_TIPS.filter((id) => id !== 'service-gap'));
        const clock = fakeClock();
        renderShift(gapCareer());
        oneTick(clock);
        expect(screen.getByRole('dialog', { name: 'Tip' }).textContent).toMatch(/too close together/);
        expect(mapProps().fitKey).toBe('tip:service-gap');
        const at = (name: string) => mapProps().layout.get(idOf(name));
        for (const name of ['Kampung Baru', 'Dang Wangi', 'KLCC']) expect(mapProps().fitTo).toContainEqual(at(name));
        expect(trainEl(REAR).getAttribute('data-spotlight')).toBe('true');
        expect(trainEl(LEADER).getAttribute('data-spotlight')).toBe('true');
        press('Enter'); // dismiss
        expect(mapProps().fitKey).not.toBe('tip:service-gap');
        expect(document.querySelector('[data-spotlight]')).toBeNull();
      });

      it('a late tip frames its train with its Station and that Station\'s neighbours, as the lean-in does', () => {
        allowMotion();
        seenTips(ALL_TIPS.filter((id) => id !== 'late'));
        const clock = fakeClock();
        const initial = careerWith([waiting(1, 'KJ', 'Jelatek')]);
        // Jelatek's platform turns late halfway through the Shift's first tick.
        const lateMs = LATE_FACTOR * targetHeadwayMs(initial.served.find((r) => r.line === 'KJ')!);
        initial.sim.platforms[idOf('Jelatek')]!.lastCall['KJ:1'] = initial.sim.shiftMs + TICK_MS / 2 - lateMs;
        renderShift(initial);
        type('J');
        clock.now += TICK_MS;
        type('e');
        expect(screen.getByRole('dialog', { name: 'Tip' }).textContent).toMatch(/This train is late/);
        expect(mapProps().fitKey).toBe('tip:late');
        const kj = net.lines.get('KJ')!.stations;
        const i = kj.indexOf(idOf('Jelatek'));
        for (const id of [kj[i - 1]!, kj[i]!, kj[i + 1]!]) expect(mapProps().fitTo).toContainEqual(mapProps().layout.get(id));
      });

      it('a late tip frames its train close', () => {
        allowMotion();
        closeCameraOn();
        seenTips(ALL_TIPS.filter((id) => id !== 'late'));
        const clock = fakeClock();
        const initial = careerWith([waiting(1, 'KJ', 'Jelatek')]);
        // Jelatek's platform turns late halfway through the Shift's first tick.
        const lateMs = LATE_FACTOR * targetHeadwayMs(initial.served.find((r) => r.line === 'KJ')!);
        initial.sim.platforms[idOf('Jelatek')]!.lastCall['KJ:1'] = initial.sim.shiftMs + TICK_MS / 2 - lateMs;
        renderShift(initial);
        type('J');
        clock.now += TICK_MS;
        type('e');
        expect(screen.getByRole('dialog', { name: 'Tip' }).textContent).toMatch(/This train is late/);
        expect(mapProps().fitKey).toMatch(/^tip:late:close:/);
        expect(mapProps().fitView).toBeDefined();
      });

      it('the close camera is on by default: with nothing stored, a tip frames close', () => {
        allowMotion();
        localStorage.removeItem(DISPATCH_CAMERA_KEY);
        seenTips(ALL_TIPS.filter((id) => id !== 'service-gap'));
        const clock = fakeClock();
        renderShift(gapCareer());
        oneTick(clock);
        expect(mapProps().fitKey).toMatch(/^tip:service-gap:close:3\.00$/);
        expect(mapProps().fitView).toBeDefined();
      });

      it('close camera off: a tip\'s frame key is as today, with no explicit frame', () => {
        allowMotion();
        seenTips(ALL_TIPS.filter((id) => id !== 'service-gap'));
        const clock = fakeClock();
        renderShift(gapCareer());
        oneTick(clock);
        expect(mapProps().fitKey).toBe('tip:service-gap');
        expect(mapProps().fitView).toBeUndefined();
      });

      it('a Service gap tip frames its pair close', () => {
        allowMotion();
        closeCameraOn();
        seenTips(ALL_TIPS.filter((id) => id !== 'service-gap'));
        const clock = fakeClock();
        const initial = gapCareer();
        renderShift(initial);
        oneTick(clock);
        expect(mapProps().fitKey).toMatch(/^tip:service-gap:close:/);
        expect(mapProps().fitView!.w).toBeLessThan(normalBox(initial.served).w);
        const at = (name: string) => mapProps().layout.get(idOf(name));
        for (const name of ['Kampung Baru', 'Dang Wangi', 'KLCC']) expect(mapProps().fitTo).toContainEqual(at(name));
        press('Enter'); // dismiss
        expect(mapProps().fitView).toBeUndefined();
      });

      it('under reduced motion a tip leaves the camera alone, close camera or not', () => {
        closeCameraOn();
        seenTips(ALL_TIPS.filter((id) => id !== 'service-gap'));
        const clock = fakeClock();
        renderShift(gapCareer());
        oneTick(clock);
        expect(screen.getByRole('dialog', { name: 'Tip' })).toBeTruthy();
        expect(mapProps().fitView).toBeUndefined();
      });

      it('a closeness change refits the close frame', () => {
        allowMotion();
        closeCameraOn();
        seenTips(ALL_TIPS.filter((id) => id !== 'service-gap'));
        const clock = fakeClock();
        renderShift(gapCareer());
        oneTick(clock);
        const before = mapProps().fitKey;
        fireEvent.change(screen.getByRole('slider', { name: 'Early closeness' }), { target: { value: '4.5' } });
        expect(mapProps().fitKey).not.toBe(before);
        expect(mapProps().fitKey).toMatch(/^tip:service-gap:close:/);
      });

      it('under reduced motion the pointing tip keeps the camera still, and the highlight still shows', () => {
        // beforeEach reports reduced motion.
        seenTips(ALL_TIPS.filter((id) => id !== 'service-gap'));
        const clock = fakeClock();
        renderShift(gapCareer());
        const normalKey = mapProps().fitKey;
        oneTick(clock);
        expect(screen.getByRole('dialog', { name: 'Tip' }).textContent).toMatch(/too close together/);
        expect(mapProps().fitKey).toBe(normalKey);
        expect(trainEl(REAR).getAttribute('data-spotlight')).toBe('true');
        expect(trainEl(LEADER).getAttribute('data-spotlight')).toBe('true');
      });

      it('a pointing tip whose train has gone shows without moving the camera', () => {
        allowMotion();
        seenTips(ALL_TIPS.filter((id) => id !== 'service-gap'));
        const clock = fakeClock();
        // The Shift clears on the tick its Service gap starts: between Shifts its trains are out of play.
        const initial = gapCareer();
        initial.gameMs = SHIFT_MS - TICK_MS;
        initial.sim.shiftMs = SHIFT_MS - TICK_MS;
        initial.sim.pairs = { [`${REAR}:${LEADER}`]: SHIFT_MS - GAP_TRIGGER_MS };
        initial.startedAt = clock.now - initial.gameMs;
        renderShift(initial);
        oneTick(clock);
        expect(screen.getByRole('region', { name: 'Expansion' })).toBeTruthy();
        expect(screen.getByRole('dialog', { name: 'Tip' }).textContent).toMatch(/too close together/);
        expect(mapProps().fitKey).toMatch(/^dispatch:.*:offers$/);
        expect(document.querySelector('[data-spotlight]')).toBeNull();
      });
    });
  });

  describe('the end of a Career', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    /** KLCC is the fourth closure: the Shift fails on the tick the second key lands. */
    const failShift = () => {
      vi.useFakeTimers();
      const clock = fakeClock();
      renderShift(closingCareer(['Bangsar', 'Damai', 'Ampang Park']));
      type('J');
      clock.now += 100;
      type('e');
      return clock;
    };
    const summary = () => screen.queryByRole('region', { name: 'Career summary' });

    it('a failing closure holds the map 1.2 s, with the gauge full, before the summary', () => {
      const clock = failShift();
      expect(summary()).toBeNull();
      expect(gauge()!.getAttribute('aria-valuenow')).toBe('4');
      expect(gauge()!.getAttribute('data-band')).toBe('danger');
      const klcc = screen.queryAllByTestId('dispatch-oos')
        .find((el) => el.getAttribute('data-station') === idOf('KLCC'));
      expect(klcc!.getAttribute('data-stamp')).toBe('true');
      expect(screen.queryByRole('button', { name: 'End Career' })).toBeNull();
      expect(judgeSpy).not.toHaveBeenCalled();
      clock.now += 1_000;
      act(() => { vi.advanceTimersByTime(1_000); });
      expect(summary()).toBeNull();
      clock.now += 200;
      act(() => { vi.advanceTimersByTime(200); });
      expect(summary()).toBeTruthy();
      act(() => { vi.advanceTimersByTime(100); });
      expect(judgeSpy).toHaveBeenCalledTimes(1);
    });

    it('the failing closure thuds during the hold', () => {
      const closure = vi.spyOn(sound, 'closure').mockImplementation(() => {});
      failShift();
      expect(summary()).toBeNull();
      expect(closure).toHaveBeenLastCalledWith(true);
    });

    it('keys during the hold do nothing', () => {
      const clock = failShift();
      type('Jelatek');
      press('Escape');
      expect(screen.queryByRole('dialog', { name: 'Paused' })).toBeNull();
      clock.now += 1_200;
      act(() => { vi.advanceTimersByTime(1_200); });
      expect(summary()).toBeTruthy();
      act(() => { vi.advanceTimersByTime(100); });
      expect(judgeSpy).toHaveBeenCalledTimes(1);
      expect(judgeSpy.mock.calls[0]![1].keylog.events.map((e) => e.k).join('')).toBe('J');
    });

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
      const initial = startCareer(net, 21);
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
        'Shift 1 ended: it started when Jelatek went out of service after a train fault was left unfixed.',
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

    it('a Career ended mid-Shift is abandoned and never judged, and the confirm says so first', () => {
      renderShift(careerWith([waiting(1, 'KJ', 'Jelatek')]));
      type('J');
      fireEvent.click(screen.getByRole('button', { name: 'End Career' }));
      expect(screen.getByText("Mid-Shift, it won't be ranked. Clear the Shift to keep your score.")).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Yes, end it' }));
      expect(screen.getByText("Ended early — an abandoned Career can't enter the leaderboard.")).toBeTruthy();
      expect(screen.queryByText('Checking your Career…')).toBeNull();
      expect(judgeSpy).not.toHaveBeenCalled();
      expect(loadProfile().integrityFails ?? []).toEqual([]);
    });
  });

  describe('Signal marks and the Green wave', () => {
    const marks = () => screen.queryAllByTestId('signal-mark');
    const markOf = (train: number) => marks().find((el) => el.getAttribute('data-train') === String(train));
    const lampOf = (train: number) => markOf(train)?.querySelector('[data-lamp]')?.getAttribute('data-lamp');
    const later = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
    /** Damai triggers; the wave clears Jelatek (2 away) then Pasar Seni (6 away). */
    const waveCareer = () => ({
      ...careerWith([waiting(1, 'KJ', 'Damai'), waiting(2, 'KJ', 'Pasar Seni'), waiting(3, 'KJ', 'Jelatek')]),
      streak: 5,
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('a wave flips its marks about 150 ms apart', () => {
      expect(RIPPLE_STEP_MS).toBeGreaterThanOrEqual(120);
      expect(RIPPLE_STEP_MS).toBeLessThanOrEqual(180);
    });

    it('every waiting Train shows a signal mark at the Station it faces: a post with a red lamp', () => {
      const initial = startCareer(net, 7);
      renderShift(initial);
      const signals = visibleTargets(net, initial.sim).filter((t) => t.ref.kind === 'signal');
      expect(signals.length).toBeGreaterThan(0);
      expect(marks()).toHaveLength(signals.length);
      for (const target of signals) {
        const train = initial.sim.trains.find((t) => target.ref.kind === 'signal' && t.id === target.ref.train)!;
        const mark = markOf(train.id)!;
        expect(mark, target.text).toBeTruthy();
        expect(mark.getAttribute('data-station')).toBe(net.lines.get(train.line)!.stations[train.at]);
        expect(mark.querySelector('path')).toBeTruthy();
        expect(lampOf(train.id)).toBe('red');
      }
    });

    it('a Clear turns the mark green, then it fades away', () => {
      vi.useFakeTimers();
      fakeClock();
      renderShift(careerWith([waiting(1, 'KJ', 'Jelatek'), waiting(2, 'KJ', 'Pasar Seni')]));
      type('Jelatek');
      expect(lampOf(1)).toBe('green');
      expect(lampOf(2)).toBe('red');
      later(400);
      expect(lampOf(1)).toBe('green');
      later(200);
      expect(markOf(1)).toBeUndefined();
      expect(lampOf(2)).toBe('red');
    });

    it('a Station going Out of service takes its mark away without turning it green', () => {
      const clock = fakeClock();
      const initial = careerWith([waiting(1, 'KJ', 'Jelatek'), waiting(2, 'KJ', 'KLCC')]);
      initial.sim.platforms[idOf('KLCC')] = {
        waiting: { [idOf('KL Sentral')]: 200 }, fullMs: OOS_CROWD_MS - 100, lastCall: {},
      };
      renderShift(initial);
      expect(lampOf(2)).toBe('red');
      type('J');
      // One frame catches up several ticks: KLCC closes, then its train runs
      // through the closed Station. Neither is a Clear.
      clock.now += 1_000;
      type('e');
      expect(screen.getByTestId('dispatch-oos').getAttribute('data-station')).toBe(idOf('KLCC'));
      expect(markOf(2)).toBeUndefined();
    });

    it('a Green wave pulses along its Line, and marks turn green in the order cleared, about 150 ms apart', () => {
      allowMotion();
      vi.useFakeTimers();
      fakeClock();
      renderShift(waveCareer());
      expect(screen.queryByTestId('wave-pulse')).toBeNull();
      type('Damai');
      expect(screen.getByTestId('wave-pulse').getAttribute('data-line')).toBe('KJ');
      expect(lampOf(1)).toBe('green');
      expect(lampOf(3)).toBe('red');
      expect(lampOf(2)).toBe('red');
      later(RIPPLE_LEAD_MS - 1);
      expect(lampOf(3)).toBe('red');
      later(1);
      expect(lampOf(3)).toBe('green');
      expect(lampOf(2)).toBe('red');
      later(RIPPLE_STEP_MS);
      expect(lampOf(2)).toBe('green');
      later(3_000);
      expect(marks()).toHaveLength(0);
      expect(screen.queryByTestId('wave-pulse')).toBeNull();
    });

    it('under reduced motion a wave has no travelling pulse, and every mark turns green at once', () => {
      vi.useFakeTimers();
      fakeClock();
      renderShift(waveCareer());
      type('Damai');
      expect(screen.queryByTestId('wave-pulse')).toBeNull();
      expect([lampOf(1), lampOf(2), lampOf(3)]).toEqual(['green', 'green', 'green']);
    });

    it('a wave has its own sound: one rising note per cleared Signal, in time with the marks', () => {
      const wave = vi.spyOn(sound, 'wave').mockImplementation(() => {});
      allowMotion();
      vi.useFakeTimers();
      fakeClock();
      const view = renderShift(waveCareer());
      type('Damai');
      expect(wave).toHaveBeenCalledTimes(1);
      expect(wave).toHaveBeenLastCalledWith([RIPPLE_LEAD_MS, RIPPLE_LEAD_MS + RIPPLE_STEP_MS]);
      view.unmount();

      // Under reduced motion the marks turn at once, so the notes come straight away.
      window.matchMedia = ((q: string) => ({
        matches: true, media: q, onchange: null, addEventListener: () => {}, removeEventListener: () => {},
        addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
      })) as unknown as typeof window.matchMedia;
      renderShift(waveCareer());
      type('Damai');
      expect(wave).toHaveBeenLastCalledWith([0, 60]);
    });

    it('no wave sound for a Clear that fires no wave', () => {
      const wave = vi.spyOn(sound, 'wave').mockImplementation(() => {});
      renderShift({ ...waveCareer(), streak: 0 });
      type('Damai');
      expect(wave).not.toHaveBeenCalled();
    });

    it('the typing line shows the streak, and flashes when a wave fires', () => {
      vi.useFakeTimers();
      fakeClock();
      renderShift({
        ...careerWith([waiting(1, 'KJ', 'Jelatek'), waiting(2, 'KJ', 'Pasar Seni'), waiting(3, 'KJ', 'KLCC')]),
        streak: 1,
      });
      const streak = () => screen.getByTestId('streak');
      expect(streak().textContent).toBe('Streak 1');
      type('Jelatek');
      expect(streak().textContent).toBe('Streak 2');
      expect(streak().getAttribute('data-wave')).toBeNull();
      type('Pasar Seni');
      expect(streak().textContent).toBe('Streak 3');
      expect(streak().getAttribute('data-wave')).toBe('true');
      later(3_000);
      expect(streak().getAttribute('data-wave')).toBeNull();
    });

    it('on shared track the pulse and a held stretch run along their own Line\'s lane, as the map draws it', () => {
      allowMotion();
      const { geo } = networkLayout();
      const tracks = trackLines(net, geo, 8);
      const sp = net.lines.get('SP')!.stations;
      const served: Served = [{ line: 'SP', from: 0, to: sp.length - 1 }];
      const jamek = idOf('Masjid Jamek');
      const origin = sp.indexOf(jamek);
      const before = careerWith([waiting(1, 'SP', 'Bandaraya')], served);
      const fault: Incident = {
        id: 1, kind: 'signal-fault', place: jamek, stations: [idOf('Plaza Rakyat'), jamek, idOf('Bandaraya')],
        line: 'SP', train: null, startedMs: 0, step: 0, extra: 0,
      };
      before.sim.incidents = [fault];
      const draw = (career: CareerState) => (
        <svg>
          <DispatchOverlay net={net} layout={geo} markScale={1} career={career}
            targets={visibleTargets(net, career.sim)} aimed={[]} tracks={tracks} />
        </svg>
      );
      const { container, rerender } = render(draw(before));
      // A wave from Masjid Jamek that found nothing waiting runs out both ways.
      const after: CareerState = {
        ...before, sim: { ...before.sim, trains: [] }, streak: 0, waves: 1,
        lastWave: { id: 1, line: 'SP', origin: jamek, cleared: [], atMs: 0 },
      };
      rerender(draw(after));
      const pulse = screen.getByTestId('wave-pulse');
      const lane = (ids: readonly string[]) => ids.map((id) => tracks.get('SP')![sp.indexOf(id)]!)
        .map((p) => `${p.x},${p.y}`).join(' ');
      const plain = (ids: readonly string[]) => ids.map((id) => geo.get(id)!).map((p) => `${p.x},${p.y}`).join(' ');
      const down = sp.slice(0, origin + 1).reverse();
      const heads = [...pulse.querySelectorAll('.wave-pulse-head')].map((el) => el.getAttribute('points'));
      expect(heads).toContain(lane(down));
      expect(heads).not.toContain(plain(down));
      const held = container.querySelector('.dispatch-held-stretch')!.getAttribute('points');
      expect(held).toBe(lane(fault.stations));
      expect(held).not.toBe(plain(fault.stations));
    });

    it('a wave from an earlier Shift does not replay', () => {
      allowMotion();
      renderShift({
        ...careerWith([waiting(1, 'KJ', 'Jelatek')]),
        streak: 3, waves: 1, lastWave: { id: 1, line: 'KJ', origin: idOf('Damai'), cleared: [9], atMs: 0 },
      });
      expect(screen.queryByTestId('wave-pulse')).toBeNull();
      expect(screen.getByTestId('streak').getAttribute('data-wave')).toBeNull();
      expect(lampOf(1)).toBe('red');
    });
  });

  describe('Passenger moments', () => {
    const later = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
    const pops = () => screen.queryAllByTestId('exchange-pop');
    const popOf = (train: number) => pops().find((el) => el.getAttribute('data-train') === String(train));
    const boardedIn = (el: Element) => Number(/\+(\d+) boarded/.exec(el.textContent ?? '')?.[1] ?? NaN);

    /** Jelatek's Train carries `load`; 18 wait at Jelatek for KLCC, which it serves. */
    const callCareer = (load: Record<string, number> = { [idOf('Jelatek')]: 6 }) => {
      const initial = careerWith([{ ...waiting(1, 'KJ', 'Jelatek'), load }, waiting(2, 'KJ', 'Pasar Seni')]);
      initial.sim.platforms[idOf('Jelatek')] = { waiting: { [idOf('KLCC')]: 18 }, fullMs: 0, lastCall: {} };
      return initial;
    };

    /** A Crowd surge at Ampang Park: 40 wait there, `extra` of them because of the surge. */
    const surgeCareer = (extra = 30) => {
      const initial = careerWith([waiting(1, 'KJ', 'Jelatek')]);
      initial.sim.incidents = [{ id: 1, kind: 'crowd-surge', place: idOf('Ampang Park'), stations: [idOf('Ampang Park')],
        line: 'KJ', train: null, startedMs: 0, step: 0, extra }];
      initial.sim.nextIncidentId = 2;
      initial.sim.platforms[idOf('Ampang Park')] = { waiting: { [idOf('KLCC')]: 40 }, fullMs: 0, lastCall: {} };
      return initial;
    };

    afterEach(() => {
      vi.useRealTimers();
    });

    it('a Train the player cleared shows who moved when it calls, and the pop fades after about a second', () => {
      vi.useFakeTimers();
      const clock = fakeClock();
      renderShift(callCareer());
      type('Jelatek');
      expect(pops()).toHaveLength(0);
      clock.now += 100;
      type('P');
      const pop = popOf(1)!;
      expect(pop).toBeTruthy();
      expect(pop.getAttribute('data-station')).toBe(idOf('Jelatek'));
      expect(boardedIn(pop)).toBeGreaterThanOrEqual(18);
      expect(pop.textContent).toContain('−6 off');
      later(800);
      expect(popOf(1)).toBeTruthy();
      later(500);
      expect(popOf(1)).toBeUndefined();
    });

    it('with nobody alighting, the pop shows only who boarded', () => {
      vi.useFakeTimers();
      const clock = fakeClock();
      renderShift(callCareer({}));
      type('Jelatek');
      clock.now += 100;
      type('P');
      expect(boardedIn(popOf(1)!)).toBeGreaterThanOrEqual(18);
      expect(popOf(1)!.textContent).not.toContain('off');
    });

    it('the Delivered chime plays with a pop that delivered someone', () => {
      vi.useFakeTimers();
      const clock = fakeClock();
      const delivered = vi.spyOn(sound, 'delivered').mockImplementation(() => {});
      renderShift(callCareer());
      type('Jelatek');
      expect(delivered).not.toHaveBeenCalled();
      clock.now += 100;
      type('P');
      expect(popOf(1)).toBeTruthy();
      expect(delivered).toHaveBeenCalledTimes(1);
      clock.now += 100;
      type('a');
      expect(delivered).toHaveBeenCalledTimes(1);
    });

    it('no chime for a pop that delivered nobody, nor for a call the player did not clear', () => {
      vi.useFakeTimers();
      const clock = fakeClock();
      const delivered = vi.spyOn(sound, 'delivered').mockImplementation(() => {});
      const klcc = idOf('KLCC');
      const initial = callCareer({});
      // Already on its way in: it calls and Delivers, but nobody cleared it.
      initial.sim.trains.push({ ...waiting(3, 'KJ', 'KLCC'), stage: 'cleared', load: { [klcc]: 5 } });
      initial.sim.nextTrainId = 4;
      renderShift(initial);
      type('Jelatek');
      clock.now += 100;
      type('P');
      expect(popOf(1)).toBeTruthy();
      expect(popOf(3)).toBeUndefined();
      expect(delivered).not.toHaveBeenCalled();
    });

    it("at peak, at most 4 pops show, and the player's own Clear always has its pop", () => {
      vi.useFakeTimers();
      const clock = fakeClock();
      // KLCC completes a streak of 12: a wave of 4 clears the nearest waiting
      // Signals on KJ, so five Trains call on the same tick. The player's own
      // Train is last in the list.
      renderShift({
        ...careerWith([
          waiting(1, 'KJ', 'Jelatek'), waiting(2, 'KJ', 'Damai'), waiting(3, 'KJ', 'Dang Wangi'),
          waiting(4, 'KJ', 'Pasar Seni'), waiting(5, 'KJ', 'Bangsar'), waiting(6, 'KJ', 'KLCC'),
        ]),
        streak: 11,
      });
      type('KLCC');
      clock.now += 100;
      type('B');
      expect(pops()).toHaveLength(4);
      expect(popOf(6)).toBeTruthy();
    });

    it('a pop whose usual spot is under a chip moves clear of every chip; the chips stay on top', () => {
      const { geo } = networkLayout();
      const popFor = (station: string): ExchangePop => ({
        key: `9-${station}`, train: 9, station, boarded: 12, alighted: 3, delivered: 3, own: true, atMs: 0,
      });
      const want = (pop: ExchangePop) => ({
        key: pop.key, at: geo.get(pop.station)!, text: [`+${pop.boarded} boarded`, `−${pop.alighted} off`], own: pop.own,
      });
      // A waiting Train whose chip lands on the usual spot of a pop at its Station.
      const kj = net.lines.get('KJ')!.stations;
      const served = new Set(servedStations(net, STARTING_NETWORK));
      const found = kj.slice(1, -1).filter((id) => served.has(id)).flatMap((id) => {
        const career = careerWith([waiting(1, 'KJ', net.stations.get(id)!.name)]);
        const targets = visibleTargets(net, career.sim);
        const { chips } = overlayLayout(net, geo, career, targets, liveMarks(net, career, targets), 1);
        const usual = popBox(layoutPops([want(popFor(id))], 1, [])[0]!);
        return chips.some((chip) => hits(chipBox(chip), usual)) ? [{ id, career, targets }] : [];
      })[0];
      expect(found, 'a Station whose chip covers its pop').toBeTruthy();
      const { id, career, targets } = found!;
      const pop = popFor(id);
      const { container } = render(
        <svg>
          <DispatchOverlay net={net} layout={geo} markScale={1} career={career} targets={targets} aimed={[]}
            moments={{ pops: [pop], dispersal: null }} />
        </svg>,
      );
      const drawn = container.querySelector('[data-testid="exchange-pop"]')!;
      const [, x, y] = /translate\(([-\d.e]+) ([-\d.e]+)\)/.exec(drawn.getAttribute('transform')!)!.map(Number);
      const box = popBox({ ...layoutPops([want(pop)], 1, [])[0]!, x: x!, y: y! });
      const chipRects = [...container.querySelectorAll('.dispatch-chip rect')].map((r) => {
        const n = (a: string) => Number(r.getAttribute(a));
        return { x0: n('x'), y0: n('y'), x1: n('x') + n('width'), y1: n('y') + n('height') };
      });
      expect(chipRects.length).toBeGreaterThan(0);
      for (const chip of chipRects) expect(hits(box, chip)).toBe(false);
      // Chips are drawn after the pops, so they stay on top.
      const order = [...container.querySelectorAll('[data-testid="exchange-pop"], .dispatch-chip')];
      expect(order[order.length - 1]!.classList.contains('dispatch-chip')).toBe(true);
    });

    it("a Crowd surge's card shows how many wait at its place", () => {
      renderShift(surgeCareer());
      const card = within(screen.getByRole('list', { name: 'Incidents' })).getByRole('listitem');
      expect(within(card).getByTestId('crowd-count').textContent).toBe('40 waiting');
    });

    it('fixing a Crowd surge drains its crowd: the count drops and people stream away, for about a second', () => {
      allowMotion();
      vi.useFakeTimers();
      fakeClock();
      renderShift(surgeCareer());
      type('Crowd control at Ampang Park');
      const burst = screen.getByTestId('dispersal');
      expect(burst.getAttribute('data-station')).toBe(idOf('Ampang Park'));
      expect(burst.querySelector('[data-count="from"]')!.textContent).toBe('40');
      expect(burst.querySelector('[data-count="to"]')!.textContent).toBe('10');
      expect(burst.textContent).toContain('−30 dispersed');
      expect(within(burst as unknown as HTMLElement).getAllByTestId('person').length).toBeGreaterThanOrEqual(3);
      later(800);
      expect(screen.getByTestId('dispersal')).toBeTruthy();
      later(500);
      expect(screen.queryByTestId('dispersal')).toBeNull();
    });

    it('under reduced motion, a fixed Crowd surge shows a static count and no burst', () => {
      vi.useFakeTimers();
      fakeClock();
      renderShift(surgeCareer());
      type('Crowd control at Ampang Park');
      const burst = screen.getByTestId('dispersal');
      expect(burst.querySelector('[data-count="from"]')).toBeNull();
      expect(burst.querySelector('[data-count="to"]')!.textContent).toBe('10');
      expect(burst.textContent).toContain('−30 dispersed');
      expect(within(burst as unknown as HTMLElement).queryAllByTestId('person')).toHaveLength(0);
    });

    it('a fixed Crowd surge with nobody to disperse shows nothing', () => {
      vi.useFakeTimers();
      fakeClock();
      renderShift(surgeCareer(0));
      type('Crowd control at Ampang Park');
      expect(screen.queryByTestId('dispersal')).toBeNull();
    });

    it('Shift cleared: before the offers, says how many passengers moved this Shift and its on-time %', () => {
      renderShift({
        ...startCareer(net, 7), status: 'between', shift: 2, cleared: 2, startedAt: 1_000, stoppedAt: 2_000,
        offers: [offerAt('AG', 'Ampang')],
        history: [
          { shift: 1, delivered: 900, calls: 50, onTimeCalls: 50, cleared: true },
          { shift: 2, delivered: 4210, calls: 200, onTimeCalls: 180, cleared: true },
        ],
      });
      const region = screen.getByRole('region', { name: 'Expansion' });
      const moved = within(region).getByText('4,210 passengers moved this Shift');
      expect(within(region).getByText('90% on time')).toBeTruthy();
      const offer = within(region).getByRole('button', { name: /Ampang/ });
      expect(moved.compareDocumentPosition(offer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

describe('Opening a Dispatcher Career', () => {
  beforeEach(() => {
    allowMotion();
    vi.useFakeTimers();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('reveals the starting Career for 1000 ms, then starts a fresh first-time lesson', () => {
    fresh();
    const clock = fakeClock();
    const start = vi.spyOn(lessonEngine, 'startLesson');
    renderLesson();
    expect(screen.getByText('Opening the network…').getAttribute('role')).toBe('status');
    expect(sound.lineOpen).not.toHaveBeenCalled();
    expect(mapProps().fitKey).not.toBe('dispatch:lesson');
    expect(mapProps().emphasisRanges).toEqual(STARTING_NETWORK);
    expect(mapProps().trackReveal).toMatchObject({ before: [], duration: 1000 });
    expect(start).not.toHaveBeenCalled();
    expect(document.querySelector('.dispatch-typing')).toBeNull();
    expect(screen.queryByText(START_TIP)).toBeNull();
    expect(screen.queryByRole('button', { name: /Skip|How to play/ })).toBeNull();
    const timeLeft = document.querySelector('.dispatch-left')!.textContent;
    clock.now += 999;
    act(() => vi.advanceTimersByTime(999));
    for (const key of ['J', ' ', 'Enter', 'Backspace']) press(key);
    expect(start).not.toHaveBeenCalled();
    expect(loadProfile().dispatchTipsSeen).not.toContain('start');
    expect(loadProfile().dispatchTipsSeen).not.toContain('lesson');
    expect(document.querySelector('.dispatch-left')!.textContent).toBe(timeLeft);
    clock.now += 1;
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText('Opening the network…')).toBeNull();
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith(net, 2000);
    expect(mapProps().fitKey).toBe('dispatch:lesson');
    expect(mapProps().trackReveal).toBeNull();
    expect(document.querySelectorAll('.prompt [data-state="done"]')).toHaveLength(0);
    expect(screen.getByText(/Type Jelatek to send it on/)).toBeTruthy();
  });

  it('finishes the network entry before applying the lesson close camera', () => {
    fresh();
    closeCameraOn();
    const clock = fakeClock();
    renderLesson();
    expect(mapProps().trackReveal).toMatchObject({ before: [], duration: 1000 });
    expect(mapProps().fitView).toBeUndefined();

    clock.now += 1000;
    act(() => vi.advanceTimersByTime(1000));
    expect(mapProps().trackReveal).toBeNull();
    expect(mapProps().fitKey).toBe('dispatch:lesson:close:3.00');
    expect(mapProps().fitView!.w).toBeCloseTo(normalBox(STARTING_NETWORK).w / 3);
    expect(screen.getByText(/Type Jelatek to send it on/)).toBeTruthy();
  });

  it('settles a withheld entry timer before routing the first accepted key into the fresh lesson', () => {
    fresh();
    const clock = fakeClock();
    const start = vi.spyOn(lessonEngine, 'startLesson');
    renderLesson();
    clock.now += 1000; // No timer callback has been delivered.
    type('J');
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith(net, 2000);
    expect(mapProps().fitKey).toBe('dispatch:lesson');
    expect([...document.querySelectorAll('.prompt [data-state="done"]')].map((el) => el.textContent).join('')).toBe('J');
    expect(loadProfile().dispatchTipsSeen).not.toContain('start');
    expect(screen.queryByRole('button', { name: 'End Career' })).toBeNull();
  });

  it('drops all entry input from the Career Keylog and action evidence', () => {
    fresh();
    const clock = fakeClock();
    renderLesson(() => {}, 21);
    clock.now += 999;
    for (const key of ['x', ' ', 'Enter', 'Backspace']) press(key);
    clock.now += 1;
    act(() => vi.advanceTimersByTime(1000));
    press('Escape'); // Skip only the newly started lesson.
    const first = visibleTargets(net, startCareer(net, 21).sim)[0]!.text.slice(0, 2);
    type(first);
    clock.now += 30 * 60_000;
    type('q');
    act(() => vi.advanceTimersByTime(2000));
    expect(judgeSpy).toHaveBeenCalledTimes(1);
    const evidence = judgeSpy.mock.calls[0]![1];
    expect(evidence.keylog.t0).toBe(1000);
    expect(evidence.keylog.events.map((event) => event.k).join('')).toBe(first);
    expect(evidence.actions).toEqual([]);
    expect(replayDispatch(net, evidence)!.complete).toBe(true);
  });

  it('a returning Career reveals before ready, and How to play and Skip never replay entry', () => {
    const clock = fakeClock();
    renderLesson();
    expect(screen.queryByRole('button', { name: /How to play/ })).toBeNull();
    clock.now += 1000;
    act(() => vi.advanceTimersByTime(1000));
    expect(mapProps().trackReveal).toBeNull();
    expect(screen.getByRole('button', { name: /How to play/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /How to play/ }));
    expect(mapProps().fitKey).toBe('dispatch:lesson');
    expect(mapProps().trackReveal).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Skip/ }));
    expect(screen.getByText(START_TIP)).toBeTruthy();
    expect(mapProps().trackReveal).toBeNull();
  });

  it.each(['Escape', 'Back to map'])('%s cancels entry without teaching or starting the lesson later', (exit) => {
    fresh();
    const clock = fakeClock();
    const onExit = vi.fn();
    const start = vi.spyOn(lessonEngine, 'startLesson');
    renderLesson(onExit);
    if (exit === 'Escape') press('Escape');
    else fireEvent.click(screen.getByRole('button', { name: /Back to map/ }));
    expect(onExit).toHaveBeenCalledTimes(1);
    clock.now += 2000;
    act(() => vi.advanceTimersByTime(2000));
    expect(start).not.toHaveBeenCalled();
    expect(loadProfile().dispatchTipsSeen).not.toContain('lesson');
  });

  it('drains a phone input burst during entry without replaying it into the lesson', () => {
    fresh();
    const clock = fakeClock();
    render(<TypingInputProvider enabled>
      <DispatcherScreen net={net} onExit={() => {}} onAgain={() => {}} lessonFor={{ seed: 7 }} />
    </TypingInputProvider>);
    const input = screen.getByRole('textbox', { name: 'Typing input for Station name' }) as HTMLInputElement;
    fireEvent.input(input, { target: { value: 'Jelatek' } });
    expect(input.value).toBe('');
    clock.now += 1000;
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText(/Type Jelatek to send it on/)).toBeTruthy();
    expect(document.querySelectorAll('.prompt [data-state="done"]')).toHaveLength(0);
    expect(screen.queryByText('There it goes.')).toBeNull();
  });

  it('shields focused navigation buttons from game Enter and Space during entry', () => {
    const onExit = vi.fn();
    renderLesson(onExit);
    const back = screen.getByRole('button', { name: /Back to map/ });
    back.focus();
    expect(fireEvent.keyDown(back, { key: 'Enter' })).toBe(false);
    expect(fireEvent.keyDown(back, { key: ' ' })).toBe(false);
    expect(onExit).not.toHaveBeenCalled();
    expect(screen.getByText('Opening the network…')).toBeTruthy();
  });

  it('a passed-in Career bypasses entry even with motion allowed', () => {
    fresh();
    renderShift(careerWith([waiting(1, 'KJ', 'Damai')]));
    expect(mapProps().trackReveal).toBeNull();
    expect(screen.queryByText('Opening the network…')).toBeNull();
    expect(screen.queryByRole('button', { name: /Skip/ })).toBeNull();
  });
});

describe('The guided first Shift', () => {
  it('opens immediately on the lesson with reduced motion: one train, zoomed in, with its caption', () => {
    fresh();
    renderLesson();
    expect(screen.getByText('This train is waiting at a red signal. Type Jelatek to send it on.')).toBeTruthy();
    expect(mapProps().fitKey).toBe('dispatch:lesson');
    expect(mapProps().emphasisRanges).toEqual([{ line: 'KJ', from: 3, to: 6 }]);
    expect(signalLabels().map((el) => el.textContent)).toEqual(['Jelatek']);
    expect(screen.queryByTestId('streak')).toBeNull();
    expect(screen.queryByText('Opening the network…')).toBeNull();
    expect(mapProps().trackReveal).toBeNull();
  });

  it('with the close camera on, the lesson frames its Stations at the early closeness', () => {
    fresh();
    closeCameraOn();
    renderLesson();
    expect(mapProps().fitKey).toBe('dispatch:lesson:close:3.00');
    expect(mapProps().fitView!.w).toBeCloseTo(normalBox(startCareer(net, 7).served).w / 3);
  });

  it('the lesson keeps its close frame under reduced motion', () => {
    // beforeEach reports reduced motion.
    fresh();
    closeCameraOn();
    renderLesson();
    expect(mapProps().fitView).toBeDefined();
  });

  it('with the close camera off, the lesson has no explicit frame', () => {
    fresh();
    renderLesson();
    expect(mapProps().fitView).toBeUndefined();
  });

  it('typing both names ends the lesson on the ready screen; its keys never reach the Keylog', async () => {
    fresh();
    allowMotion();
    const clock = fakeClock();
    renderLesson(() => {}, 21);
    clock.now += 1000;
    press('Shift'); // Settle entry before any lesson typing, even without its timer.
    expect(mapProps().fitKey).toBe('dispatch:lesson');
    type('Jelatek');
    clock.now += 30_000; press('Shift');
    expect(screen.getByText(/Type Setiawangsa\./)).toBeTruthy();
    type('Setiawangsa');
    // The last clear holds a moment, so its train is seen pulling away; keys wait.
    clock.now += 600; type('Ka');
    expect(mapProps().fitKey).toBe('dispatch:lesson');
    expect(screen.queryByText(START_TIP)).toBeNull();
    clock.now += 600; press('Shift');
    expect(screen.getByText(START_TIP)).toBeTruthy();
    expect(mapProps().fitKey).not.toBe('dispatch:lesson');
    expect(mapProps().trackReveal).toBeNull();
    expect(loadProfile().dispatchTipsSeen).toContain('lesson');
    const first = visibleTargets(net, startCareer(net, 21).sim)[0]!.text;
    type(first.slice(0, 2));
    clock.now += 30 * 60_000; type('x');
    await waitFor(() => expect(judgeSpy).toHaveBeenCalled());
    expect(judgeSpy.mock.calls[0]![1].keylog.events.map((e) => e.k).join('')).toBe(first.slice(0, 2));
    expect(replayDispatch(net, judgeSpy.mock.calls[0]![1])!.complete).toBe(true);
  });

  it('Esc during the finishing moment ends the lesson at once', () => {
    fresh();
    const clock = fakeClock();
    renderLesson();
    type('Jelatek');
    clock.now += 30_000; press('Shift');
    type('Setiawangsa');
    expect(mapProps().fitKey).toBe('dispatch:lesson');
    press('Escape');
    expect(screen.getByText(START_TIP)).toBeTruthy();
    expect(loadProfile().dispatchTipsSeen).toContain('lesson');
  });

  it('while the lesson\'s train moves, the typing line asks for nothing', () => {
    fresh();
    const clock = fakeClock();
    renderLesson();
    type('Jelatek');
    expect(screen.getByText('There it goes.')).toBeTruthy();
    expect(screen.queryByText(/Type a waiting Station's name/)).toBeNull();
    clock.now += 30_000; press('Shift');
    type('Setiawangsa'); // finished: the hold asks for nothing either
    expect(screen.queryByText(/Type a waiting Station's name/)).toBeNull();
  });

  it('the lesson\'s empty train shows no passenger pop when it calls', () => {
    fresh();
    const clock = fakeClock();
    renderLesson();
    type('Jelatek');
    clock.now += 1_000; press('Shift'); // called at Jelatek, nobody on or off
    expect(screen.queryAllByTestId('exchange-pop')).toHaveLength(0);
  });

  it('a wrong key in the lesson shows, and Backspace takes it back', () => {
    fresh(); renderLesson();
    type('Jx');
    expect(screen.getByText('Wrong key')).toBeTruthy();
    press('Backspace');
    expect(screen.queryByText('Wrong key')).toBeNull();
  });

  it('Esc or Skip ends the lesson and marks it seen; Esc again then leaves', () => {
    fresh();
    const onExit = vi.fn();
    const view = renderLesson(onExit);
    press('Escape');
    expect(onExit).not.toHaveBeenCalled();
    expect(screen.getByText(START_TIP)).toBeTruthy();
    expect(loadProfile().dispatchTipsSeen).toContain('lesson');
    press('Escape');
    expect(onExit).toHaveBeenCalledTimes(1);
    view.unmount();

    fresh();
    renderLesson(onExit);
    fireEvent.click(screen.getByRole('button', { name: /Skip/ }));
    expect(screen.getByText(START_TIP)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Skip/ })).toBeNull();
    expect(loadProfile().dispatchTipsSeen).toContain('lesson');
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('a returning player who has played a Career still sees the start caption after the lesson', () => {
    seenTips(ALL_TIPS.filter((id) => id !== 'lesson')); // 'start' seen in an earlier Career
    const view = renderLesson();
    press('Escape');
    expect(screen.getByText(START_TIP)).toBeTruthy();
    view.unmount();

    seenTips(ALL_TIPS.filter((id) => id !== 'lesson'));
    const clock = fakeClock();
    renderLesson();
    type('Jelatek');
    clock.now += 30_000; press('Shift');
    type('Setiawangsa');
    clock.now += 2_000; press('Shift');
    expect(screen.getByText(START_TIP)).toBeTruthy();
    type('S'); // the Career's first key puts the caption away
    expect(screen.queryByText(START_TIP)).toBeNull();
  });

  it('Back to map mid-lesson leaves without marking it seen', () => {
    fresh();
    const onExit = vi.fn();
    renderLesson(onExit);
    fireEvent.click(screen.getByRole('button', { name: /Back to map/ }));
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(loadProfile().dispatchTipsSeen ?? []).not.toContain('lesson');
  });

  it('How to play replays the lesson, then the start caption and every tip show again', () => {
    seenTips(ALL_TIPS); // everything seen, lesson included
    renderLesson();
    expect(mapProps().trackReveal).toBeNull();
    expect(screen.queryByText('Opening the network…')).toBeNull();
    expect(screen.queryByText(START_TIP)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /How to play/ }));
    expect(screen.getByText('This train is waiting at a red signal. Type Jelatek to send it on.')).toBeTruthy();
    expect(loadProfile().dispatchTipsSeen).toEqual([]);
    press('Escape');
    expect(screen.getByText(START_TIP)).toBeTruthy();
  });

  it('How to play is gone once the Shift has started', () => {
    renderShift(careerWith([waiting(1, 'KJ', 'Jelatek')]));
    type('J');
    expect(screen.queryByRole('button', { name: /How to play/ })).toBeNull();
  });

  it('a Career passed in (the dev full-network Career) never shows the lesson', () => {
    fresh();
    renderShift(careerWith([waiting(1, 'KJ', 'Damai')]));
    expect(screen.queryByText(/Type Jelatek to send it on/)).toBeNull();
  });
});

describe('Leaning in on an Incident fix', () => {
  /** Three Trains waiting across the Line, and a Crowd surge at Ampang Park. */
  const surgeWithWaiting = () => {
    const initial = careerWith([waiting(1, 'KJ', 'Jelatek'), waiting(2, 'KJ', 'Bangsar', -1),
      waiting(3, 'KJ', 'Kerinchi', -1)]);
    initial.sim.incidents = [{ id: 1, kind: 'crowd-surge', place: idOf('Ampang Park'), stations: [idOf('Ampang Park')],
      line: 'KJ', train: null, startedMs: 0, step: 0, extra: 0 }];
    initial.sim.nextIncidentId = 2;
    return initial;
  };
  const root = (container: HTMLElement) => container.querySelector('.dispatcher')!;
  const glow = () => screen.queryByTestId('incident-glow');

  it('locking onto a fix leans in: urgent edge, place glow, and a fix frame that keeps every waiting train', () => {
    allowMotion();
    const initial = surgeWithWaiting();
    const { container } = renderShift(initial);
    const normalKey = mapProps().fitKey;
    expect(normalKey).toMatch(/^dispatch:/);
    expect(root(container).getAttribute('data-urgent')).toBeNull();
    expect(glow()).toBeNull();

    type('C');
    expect(root(container).getAttribute('data-urgent')).toBe('true');
    const place = glow();
    expect(place).toBeTruthy();
    expect(place!.closest('[data-testid="dispatch-incident"]')).toBeTruthy();

    const props = mapProps();
    expect(props.fitKey).toMatch(/^fix:1/);
    const at = (name: string) => props.layout.get(idOf(name));
    for (const name of ['Jelatek', 'Bangsar', 'Kerinchi', 'Ampang Park']) {
      expect(props.fitTo).toContainEqual(at(name));
    }
    // The place's neighbours on its Line, so the lean never closes in on one dot.
    const kj = net.lines.get('KJ')!.stations;
    const i = kj.indexOf(idOf('Ampang Park'));
    expect(props.fitTo).toContainEqual(props.layout.get(kj[i - 1]!));
    expect(props.fitTo).toContainEqual(props.layout.get(kj[i + 1]!));
  });

  it('a train that starts waiting mid-fix joins the frame, and the map refits to take it in', async () => {
    allowMotion();
    const clock = fakeClock();
    const initial = surgeWithWaiting();
    // One block short of Pasar Seni's Signal.
    initial.sim.trains.push({ ...waiting(4, 'KJ', 'Masjid Jamek'), stage: 'running', ms: TRAVEL_MS - TICK_MS });
    initial.sim.nextTrainId = 5;
    renderShift(initial);
    type('C');
    const pasarSeni = () => mapProps().layout.get(idOf('Pasar Seni'));
    const before = mapProps().fitKey;
    expect(before).toMatch(/^fix:1/);
    expect(mapProps().fitTo).not.toContainEqual(pasarSeni());

    clock.now += TICK_MS * 2;
    await waitFor(() => expect(mapProps().fitTo).toContainEqual(pasarSeni()));
    expect(mapProps().fitKey).toMatch(/^fix:1/);
    expect(mapProps().fitKey).not.toBe(before);
  });

  it('completing the fix lets go: no urgency, no glow, and the normal frame is back', () => {
    allowMotion();
    const { container } = renderShift(surgeWithWaiting());
    const normalKey = mapProps().fitKey;
    type('Crowd control at Ampang Park');
    expect(screen.queryAllByTestId('dispatch-incident')).toHaveLength(0);
    expect(root(container).getAttribute('data-urgent')).toBeNull();
    expect(glow()).toBeNull();
    expect(mapProps().fitKey).toBe(normalKey);
  });

  describe('the close camera while a fix is typed', () => {
    /** A second crowd surge, at Masjid Jamek. */
    const twoSurges = () => {
      const initial = surgeWithWaiting();
      initial.sim.incidents.push({ id: 2, kind: 'crowd-surge', place: idOf('Masjid Jamek'),
        stations: [idOf('Masjid Jamek')], line: 'KJ', train: null, startedMs: 0, step: 0, extra: 0 });
      initial.sim.nextIncidentId = 3;
      return initial;
    };
    const kj = () => net.lines.get('KJ')!.stations;

    it('locking onto a fix zooms in on its place and its neighbours, leaving the waiting trains out', () => {
      allowMotion();
      closeCameraOn();
      const initial = surgeWithWaiting();
      renderShift(initial);
      type('C');
      expect(mapProps().fitKey).toMatch(/^fix:1:close:/);
      expect(mapProps().fitView!.w).toBeLessThan(normalBox(initial.served).w);
      const i = kj().indexOf(idOf('Ampang Park'));
      for (const id of [kj()[i - 1]!, kj()[i]!, kj()[i + 1]!]) expect(mapProps().fitTo).toContainEqual(mapProps().layout.get(id));
      expect(mapProps().fitTo).not.toContainEqual(mapProps().layout.get(idOf('Kerinchi')));
    });

    it('clearing the fix zooms straight out', () => {
      allowMotion();
      closeCameraOn();
      renderShift(surgeWithWaiting());
      const normalKey = mapProps().fitKey;
      type('Crowd control at Ampang Park');
      expect(mapProps().fitKey).toBe(normalKey);
      expect(mapProps().fitView).toBeUndefined();
    });

    it('Backspacing the fix away zooms straight out', () => {
      allowMotion();
      closeCameraOn();
      renderShift(surgeWithWaiting());
      const normalKey = mapProps().fitKey;
      type('C');
      expect(mapProps().fitKey).toMatch(/^fix:1:close:/);
      press('Backspace');
      expect(mapProps().fitKey).toBe(normalKey);
      expect(mapProps().fitView).toBeUndefined();
    });

    it('locking onto the next fix moves the close view to it', () => {
      allowMotion();
      closeCameraOn();
      renderShift(twoSurges());
      type('Crowd control at Ampang Park');
      type('Crowd control at M');
      expect(mapProps().fitKey).toMatch(/^fix:2:close:/);
      expect(mapProps().fitTo).toContainEqual(mapProps().layout.get(idOf('Masjid Jamek')));
    });

    it('a closeness change refits the close view', () => {
      allowMotion();
      closeCameraOn();
      renderShift(surgeWithWaiting());
      type('C');
      const before = mapProps().fitKey;
      fireEvent.change(screen.getByRole('slider', { name: 'Early closeness' }), { target: { value: '4.5' } });
      expect(mapProps().fitKey).not.toBe(before);
      expect(mapProps().fitKey).toMatch(/^fix:1:close:/);
    });

    it('a signal fault keeps its close view from its first name until its last clears it', () => {
      allowMotion();
      closeCameraOn();
      const initial = careerWith([waiting(1, 'KJ', 'Jelatek')]);
      initial.sim.incidents = [signalFault()];
      initial.sim.nextIncidentId = 2;
      renderShift(initial);
      const normalKey = mapProps().fitKey;
      type('Dang Wangi');
      expect(mapProps().fitKey).toMatch(/^fix:1:close:/);
      type('Masjid Jamek');
      expect(mapProps().fitKey).toMatch(/^fix:1:close:/);
      type('Pasar Seni');
      expect(mapProps().fitKey).toBe(normalKey);
    });

    it('under reduced motion locking onto a fix leaves the camera alone', () => {
      // beforeEach reports reduced motion.
      closeCameraOn();
      renderShift(surgeWithWaiting());
      const normalKey = mapProps().fitKey;
      type('C');
      expect(mapProps().fitKey).toBe(normalKey);
      expect(mapProps().fitView).toBeUndefined();
    });
  });

  it('Backspacing a fix away lets go: no urgency, no glow, and the normal frame is back', () => {
    allowMotion();
    const { container } = renderShift(surgeWithWaiting());
    const normalKey = mapProps().fitKey;
    type('Crow');
    expect(root(container).getAttribute('data-urgent')).toBe('true');
    for (let i = 0; i < 'Crow'.length; i += 1) press('Backspace');
    expect(root(container).getAttribute('data-urgent')).toBeNull();
    expect(glow()).toBeNull();
    expect(mapProps().fitKey).toBe(normalKey);
  });

  it('under reduced motion the camera stays put, while the edge and glow still show', () => {
    // beforeEach reports reduced motion.
    const { container } = renderShift(surgeWithWaiting());
    const normalKey = mapProps().fitKey;
    type('C');
    expect(root(container).getAttribute('data-urgent')).toBe('true');
    expect(glow()).toBeTruthy();
    expect(mapProps().fitKey).toBe(normalKey);
  });

  it('the urgent edge holds off while the Pause dialog shows, and comes back on resuming', () => {
    const { container } = renderShift(surgeWithWaiting());
    type('C');
    expect(root(container).getAttribute('data-urgent')).toBe('true');
    press('Escape');
    expect(screen.getByRole('dialog', { name: 'Paused' })).toBeTruthy();
    expect(root(container).getAttribute('data-urgent')).toBeNull();
    press('Enter');
    expect(root(container).getAttribute('data-urgent')).toBe('true');
  });

  it('the urgent edge holds off while a Tip shows', () => {
    seenTips(ALL_TIPS.filter((id) => id !== 'out-of-service'));
    const clock = fakeClock();
    const initial = surgeWithWaiting();
    initial.sim.platforms[idOf('KLCC')] = {
      waiting: { [idOf('KL Sentral')]: 200 }, fullMs: OOS_CROWD_MS - 100, lastCall: {},
    };
    const { container } = renderShift(initial);
    type('C');
    expect(root(container).getAttribute('data-urgent')).toBe('true');
    clock.now += 100;
    type('r');
    expect(screen.getByRole('dialog', { name: 'Tip' })).toBeTruthy();
    expect(root(container).getAttribute('data-urgent')).toBeNull();
    press('Enter');
    expect(screen.queryByRole('dialog', { name: 'Tip' })).toBeNull();
    expect(root(container).getAttribute('data-urgent')).toBe('true');
  });

  it('the edge pulse and the glow hold still under reduced motion', () => {
    const css = readFileSync('src/ui/dispatch.css', 'utf8');
    expect(css).toMatch(/\.dispatcher\[data-urgent='true'\]::after\s*\{[^}]*animation:\s*urgent-edge/);
    expect(css).toMatch(/\.incident-glow\s*\{[^}]*animation:\s*incident-glow/);
    const blocks = css.split('@media (prefers-reduced-motion: reduce)').slice(1).map((rest) => {
      // The block body runs to its closing brace at column 0.
      return rest.slice(0, rest.indexOf('\n}'));
    });
    const reduced = blocks.find((b) => b.includes('data-urgent'));
    expect(reduced).toBeDefined();
    expect(reduced).toMatch(/\.dispatcher\[data-urgent='true'\]::after\s*\{[^}]*animation:\s*none/);
    expect(reduced).toMatch(/\.incident-glow\s*\{[^}]*animation:\s*none/);
  });

  it('the gauge pop holds still under reduced motion', () => {
    const css = readFileSync('src/ui/dispatch.css', 'utf8');
    expect(css).toMatch(/\.closure-slot\[data-fresh='true'\]\s*\{[^}]*animation:\s*closure-slot-pop/);
    const reduced = css.split('@media (prefers-reduced-motion: reduce)').slice(1)
      .map((rest) => rest.slice(0, rest.indexOf('\n}'))).find((b) => b.includes('closure-slot'));
    expect(reduced).toBeDefined();
    expect(reduced).toMatch(/\.closure-slot\[data-fresh='true'\]\s*\{[^}]*animation:\s*none/);
  });
});

describe('the closure gauge', () => {
  it('its track never grows or shrinks, so the gauge cannot wrap the Shift bar', () => {
    const css = readFileSync('src/ui/dispatch.css', 'utf8');
    expect(css).toMatch(/\.closure-track\s*\{[^}]*flex:\s*none/);
  });

  it('closureBand marks calm, warn and danger by share', () => {
    expect(closureBand(1, 4)).toBe('calm');
    expect(closureBand(2, 4)).toBe('warn');
    expect(closureBand(3, 4)).toBe('danger');
    expect(closureBand(5, 13)).toBe('calm');
    expect(closureBand(6, 13)).toBe('warn');
    expect(closureBand(10, 13)).toBe('danger');
  });

  it('there is no gauge until the first closure', () => {
    renderShift(closingCareer());
    type('J');
    expect(gauge()).toBeNull();
  });

  it('the first closure brings the gauge: one slot per closure the Shift can take', () => {
    const clock = fakeClock();
    renderShift(closingCareer());
    closeKlcc(clock);
    const bar = gauge()!;
    expect(bar.getAttribute('aria-valuenow')).toBe('1');
    expect(bar.getAttribute('aria-valuemax')).toBe('4');
    const slots = [...bar.querySelectorAll('[data-slot]')];
    expect(slots).toHaveLength(4);
    expect(slots.filter((el) => el.getAttribute('data-filled') === 'true')).toHaveLength(1);
    expect(slots[3]!.getAttribute('data-line')).toBe('true');
    expect(bar.parentElement!.textContent).toContain('1 / 4');
    expect(bar.getAttribute('data-band')).toBe('calm');
  });

  it('it turns red near the line', () => {
    const clock = fakeClock();
    renderShift(closingCareer(['Bangsar', 'Damai']));
    closeKlcc(clock);
    const bar = gauge()!;
    expect(bar.getAttribute('aria-valuenow')).toBe('3');
    expect(bar.getAttribute('data-band')).toBe('danger');
  });

  it('the newest slot pops while the closure is fresh', () => {
    const clock = fakeClock();
    renderShift(closingCareer(['Bangsar', 'Damai']));
    closeKlcc(clock);
    expect(gauge()!.querySelectorAll('[data-slot]')[2]!.getAttribute('data-fresh')).toBe('true');
    clock.now += 1_500;
    press('Shift');
    expect(gauge()!.querySelectorAll('[data-slot]')[2]!.getAttribute('data-fresh')).not.toBe('true');
  });

  it('never shows more closed than slots, when several closures land on the failing tick', () => {
    render(<ClosureGauge closed={5} slots={4} fresh={false} />);
    const bar = gauge()!;
    expect(bar.getAttribute('aria-valuenow')).toBe('4');
    expect(bar.parentElement!.textContent).toContain('4 / 4');
    expect(bar.querySelectorAll('[data-filled="true"]')).toHaveLength(4);
  });

  it('the gauge is gone at the next Shift', () => {
    const base = closingCareer(['Bangsar']);
    const initial: CareerState = {
      ...base, status: 'ready', shift: 2, sim: startShiftSim(net, base.served, base.sim.rng),
    };
    renderShift(initial);
    expect(gauge()).toBeNull();
  });
});

describe('the closure thud', () => {
  it('a closure thuds, heavy in the red band', () => {
    const closure = vi.spyOn(sound, 'closure').mockImplementation(() => {});
    const clock = fakeClock();
    const view = renderShift(closingCareer());
    closeKlcc(clock);
    expect(closure).toHaveBeenCalledTimes(1);
    expect(closure).toHaveBeenLastCalledWith(false);
    view.unmount();

    renderShift(closingCareer(['Bangsar', 'Damai']));
    closeKlcc(clock);
    expect(closure).toHaveBeenLastCalledWith(true);
  });

  it('no thud for closures already there when the screen opened', () => {
    const closure = vi.spyOn(sound, 'closure').mockImplementation(() => {});
    renderShift(closingCareer(['Bangsar']));
    type('J');
    expect(closure).not.toHaveBeenCalled();
  });
});

describe('the closure stamp', () => {
  const oosFor = (name: string) => screen.queryAllByTestId('dispatch-oos')
    .find((el) => el.getAttribute('data-station') === idOf(name));

  it('a closing Station is stamped on the map, with a ring, for about a second', () => {
    allowMotion();
    const clock = fakeClock();
    renderShift(closingCareer());
    closeKlcc(clock);
    expect(oosFor('KLCC')!.getAttribute('data-stamp')).toBe('true');
    expect(screen.queryAllByTestId('oos-ring')).toHaveLength(1);
    clock.now += 1_000;
    press('Shift');
    expect(oosFor('KLCC')).toBeDefined();
    expect(oosFor('KLCC')!.getAttribute('data-stamp')).toBeNull();
    expect(screen.queryByTestId('oos-ring')).toBeNull();
  });

  it('under reduced motion the stamp has no ring', () => {
    const clock = fakeClock();
    renderShift(closingCareer());
    closeKlcc(clock);
    expect(oosFor('KLCC')!.getAttribute('data-stamp')).toBe('true');
    expect(screen.queryByTestId('oos-ring')).toBeNull();
  });

  it('a Station closed before the screen opened is not stamped', () => {
    allowMotion();
    fakeClock();
    renderShift(closingCareer(['Bangsar']));
    type('J');
    expect(oosFor('Bangsar')).toBeDefined();
    expect(oosFor('Bangsar')!.getAttribute('data-stamp')).toBeNull();
    expect(screen.queryByTestId('oos-ring')).toBeNull();
  });

  it('the camera does not move for a closure', () => {
    const clock = fakeClock();
    renderShift(closingCareer());
    type('J');
    const before = mapProps().fitKey;
    clock.now += 1_000;
    type('e');
    expect(oosFor('KLCC')).toBeDefined();
    expect(mapProps().fitKey).toBe(before);
  });

  it('the animations freeze while the Shift is paused', () => {
    const css = readFileSync('src/ui/dispatch.css', 'utf8');
    expect(css).toMatch(/\.dispatcher\[data-paused='true'\][^{]*\.dispatch-oos\[data-stamp='true'\][^{]*\{[^}]*animation-play-state:\s*paused/);
    expect(css).toMatch(/\.dispatcher\[data-paused='true'\][^{]*\.dispatch-oos-ring[^{]*\{[^}]*animation-play-state:\s*paused/);
    expect(css).toMatch(/\.dispatcher\[data-paused='true'\][^{]*\.closure-slot[^{]*\{[^}]*animation-play-state:\s*paused/);
  });

  it('the root is marked paused while the Shift is paused', () => {
    fakeClock();
    const { container } = renderShift(closingCareer());
    type('J');
    const root = container.querySelector('.dispatcher')!;
    expect(root.getAttribute('data-paused')).toBeNull();
    press('Escape');
    expect(root.getAttribute('data-paused')).toBe('true');
  });
});

describe('a closing Incident', () => {
  /** A Signal fault at Masjid Jamek that goes Out of service on the first tick. */
  function faultClosing(): CareerState {
    const initial = careerWith([waiting(1, 'KJ', 'Jelatek'), waiting(2, 'KJ', 'Pasar Seni')]);
    initial.sim.incidents = [{ ...signalFault(), startedMs: -(INCIDENT_LIMIT_MS - 100) }];
    initial.sim.nextIncidentId = 2;
    return initial;
  }
  const list = () => screen.queryByRole('list', { name: 'Incidents' });

  it('its card stays, marked Out of service, for about 1.5 s', () => {
    const clock = fakeClock();
    renderShift(faultClosing());
    type('J');
    clock.now += 1_000;
    type('e');
    const items = within(list()!).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0]!.getAttribute('data-closed')).toBe('true');
    expect(items[0]!.textContent).toContain('Out of service');
    expect(items[0]!.textContent).toContain('Masjid Jamek');
    expect(within(items[0]!).getByRole('progressbar', { name: 'Masjid Jamek is out of service' })).toBeTruthy();
    expect(screen.queryByText('No Incidents')).toBeNull();
    clock.now += 1_500;
    press('Shift');
    expect(list()).toBeNull();
    expect(screen.getByText('No Incidents')).toBeTruthy();
  });

  it('it waits behind the out-of-service tip', () => {
    seenTips(ALL_TIPS.filter((id) => id !== 'out-of-service'));
    const clock = fakeClock();
    renderShift(faultClosing());
    type('J');
    clock.now += 1_000;
    type('e');
    expect(screen.getByRole('dialog', { name: 'Tip' })).toBeTruthy();
    expect(list()!.querySelector('[data-closed="true"]')).not.toBeNull();
    // The closure animations stand still behind the tip.
    expect(document.querySelector('.dispatcher')!.getAttribute('data-paused')).toBe('true');
    clock.now += 5_000;
    press('Enter');
    expect(screen.queryByRole('dialog', { name: 'Tip' })).toBeNull();
    expect(list()!.querySelector('[data-closed="true"]')).not.toBeNull();
    clock.now += 1_600;
    press('Shift');
    expect(list()).toBeNull();
  });

  it('the card animation freezes with the Shift and stops under reduced motion', () => {
    const css = readFileSync('src/ui/dispatch.css', 'utf8');
    expect(css).toMatch(/\.dispatcher\[data-paused='true'\][^{]*\.dispatch-incident-card\[data-closed='true'\][^{]*\{[^}]*animation-play-state:\s*paused/);
    expect(css).toMatch(/prefers-reduced-motion[^{]*\{\s*\.dispatch-incident-card\[data-closed='true'\]\s*\{\s*animation:\s*none/);
  });

  it('a crowding closure leaves no card', () => {
    const clock = fakeClock();
    renderShift(closingCareer());
    closeKlcc(clock);
    expect(list()).toBeNull();
    expect(screen.getByText('No Incidents')).toBeTruthy();
  });
});

describe('Chips and the panels over the map', () => {
  /** The map is 1512×690 at the origin (see beforeEach); this panel sits where it is told. */
  const panelAt = (selector: string, rect: { x: number; y: number; w: number; h: number }) => {
    const full = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this.matches(selector)) {
        return { x: rect.x, y: rect.y, left: rect.x, top: rect.y, right: rect.x + rect.w, bottom: rect.y + rect.h,
          width: rect.w, height: rect.h, toJSON: () => ({}) } as DOMRect;
      }
      return full.call(this);
    };
  };
  /** A chip's box on screen, from its rect in layout units and the map's viewBox. */
  const onScreen = (container: HTMLElement, name: string) => {
    const [x, y, w, h] = container.querySelector('svg.map-canvas')!.getAttribute('viewBox')!.split(' ').map(Number) as
      [number, number, number, number];
    const px = Math.min(1512 / w, 690 / h);
    const left = x + w / 2 - 1512 / (2 * px);
    const top = y + h / 2 - 690 / (2 * px);
    const rect = labelFor(name)!.querySelector('rect')!;
    const at = (attr: string) => Number(rect.getAttribute(attr));
    return {
      x0: (at('x') - left) * px, y0: (at('y') - top) * px,
      x1: (at('x') + at('width') - left) * px, y1: (at('y') + at('height') - top) * px,
    };
  };
  const overlaps = (a: { x0: number; y0: number; x1: number; y1: number }, r: { x: number; y: number; w: number; h: number }) =>
    a.x0 < r.x + r.w && r.x < a.x1 && a.y0 < r.y + r.h && r.y < a.y1;

  it('a chip whose spot goes under the Incidents panel as it grows moves out from under it', () => {
    const { container } = renderShift(careerWith([waiting(1, 'KJ', 'Jelatek')]));
    const free = onScreen(container, 'Jelatek');
    // The panel grows down over the chip, as a new card would make it.
    const panel = { x: free.x0 - 20, y: free.y0 - 40, w: free.x1 - free.x0 + 40, h: free.y1 - free.y0 + 80 };
    expect(overlaps(free, panel)).toBe(true);
    panelAt('.dispatch-side', panel);
    act(() => { window.dispatchEvent(new Event('resize')); });
    const moved = onScreen(container, 'Jelatek');
    expect(overlaps(moved, panel)).toBe(false);
  });

  it('a panel that grows on a render is measured again before paint, with no resize', () => {
    const { container } = renderShift(careerWith([waiting(1, 'KJ', 'Jelatek')]));
    const free = onScreen(container, 'Jelatek');
    const grown = { x: free.x0 - 20, y: free.y0 - 10, w: free.x1 - free.x0 + 40, h: 690 - free.y0 };
    // The typing panel is a strip at the bottom until it holds the Pause dialog.
    const full = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (!this.matches('.play-panel')) return full.call(this);
      const r = this.querySelector('.dispatch-paused') ? grown : { x: 100, y: 670, w: 300, h: 20 };
      return { x: r.x, y: r.y, left: r.x, top: r.y, right: r.x + r.w, bottom: r.y + r.h,
        width: r.w, height: r.h, toJSON: () => ({}) } as DOMRect;
    };
    type('J');
    expect(overlaps(onScreen(container, 'Jelatek'), grown)).toBe(true);
    press('Escape');
    expect(screen.getByRole('dialog', { name: 'Paused' })).toBeTruthy();
    expect(overlaps(onScreen(container, 'Jelatek'), grown)).toBe(false);
  });

  it('a chip keeps out from under the typing panel too', () => {
    const { container } = renderShift(careerWith([waiting(1, 'KJ', 'Jelatek')]));
    const free = onScreen(container, 'Jelatek');
    const panel = { x: free.x0 - 20, y: free.y0 - 10, w: free.x1 - free.x0 + 40, h: 690 - free.y0 };
    panelAt('.play-panel', panel);
    act(() => { window.dispatchEvent(new Event('resize')); });
    expect(overlaps(onScreen(container, 'Jelatek'), panel)).toBe(false);
  });
});

const offerAt = (line: LineCode, name: string): Expansion => {
  const id = idOf(name);
  const at = net.lines.get(line)!.stations.indexOf(id);
  return { line, from: Math.max(0, at - 2), to: at, farEnd: id, added: [id] };
};

describe('End Career asks first', () => {
  /** A Shift under way: End Career is disabled until the first key starts it. */
  const renderRunning = () => {
    renderShift(careerWith([waiting(1, 'KJ', 'Jelatek'), waiting(2, 'KJ', 'Pasar Seni')]));
    type('J');
  };
  const betweenShifts = (): CareerState => ({ ...startCareer(net, 7), status: 'between', shift: 1, cleared: 1,
    startedAt: 1_000, stoppedAt: 2_000, offers: [offerAt('AG', 'Ampang')],
    history: [{ shift: 1, delivered: 40, calls: 10, onTimeCalls: 9, cleared: true }] });
  const stillPlaying = () => {
    expect(screen.queryByRole('region', { name: 'Career summary' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Career ended' })).toBeNull();
  };

  it("one click on End Career doesn't end the Career", () => {
    renderRunning();
    fireEvent.click(screen.getByRole('button', { name: 'End Career' }));
    stillPlaying();
    expect(screen.getByText('End Career?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Yes, end it' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keep playing' })).toBeTruthy();
    expect(screen.getByRole('banner', { name: 'Shift' })).toBeTruthy();
  });

  it('Yes, end it ends it', () => {
    renderRunning();
    endCareer();
    expect(screen.getByRole('heading', { name: 'Career ended' })).toBeTruthy();
    expect(screen.getByText("Ended early — an abandoned Career can't enter the leaderboard.")).toBeTruthy();
  });

  it('Keep playing puts End Career back', () => {
    renderRunning();
    fireEvent.click(screen.getByRole('button', { name: 'End Career' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep playing' }));
    expect(screen.getByRole('button', { name: 'End Career' })).toBeTruthy();
    expect(screen.queryByText('End Career?')).toBeNull();
    stillPlaying();
  });

  it('the question goes away by itself', () => {
    vi.useFakeTimers();
    try {
      renderRunning();
      fireEvent.click(screen.getByRole('button', { name: 'End Career' }));
      expect(screen.getByText('End Career?')).toBeTruthy();
      act(() => { vi.advanceTimersByTime(END_CONFIRM_MS - 1); });
      expect(screen.getByText('End Career?')).toBeTruthy();
      act(() => { vi.advanceTimersByTime(1); });
      expect(screen.getByRole('button', { name: 'End Career' })).toBeTruthy();
      expect(screen.queryByText('End Career?')).toBeNull();
      stillPlaying();
    } finally {
      vi.useRealTimers();
    }
  });

  it('Enter and Space never answer it', () => {
    renderRunning();
    fireEvent.click(screen.getByRole('button', { name: 'End Career' }));
    for (const name of ['Yes, end it', 'Keep playing']) {
      const button = screen.getByRole('button', { name });
      button.focus();
      expect(fireEvent.keyDown(button, { key: 'Enter' })).toBe(false);
      expect(fireEvent.keyDown(button, { key: ' ' })).toBe(false);
    }
    stillPlaying();
    expect(screen.getByText('End Career?')).toBeTruthy();
  });

  it('the Expansion screen asks too', () => {
    renderShift(betweenShifts());
    fireEvent.click(screen.getByRole('button', { name: 'End Career' }));
    stillPlaying();
    expect(screen.getByRole('region', { name: 'Expansion' })).toBeTruthy();
    expect(screen.getByText('End Career?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, end it' }));
    expect(screen.getByRole('heading', { name: 'Career retired' })).toBeTruthy();
  });

  it('on the Expansion screen Enter and Space never answer it either', () => {
    renderShift(betweenShifts());
    fireEvent.click(screen.getByRole('button', { name: 'End Career' }));
    for (const name of ['Yes, end it', 'Keep playing']) {
      const button = screen.getByRole('button', { name });
      button.focus();
      expect(fireEvent.keyDown(button, { key: 'Enter' })).toBe(false);
      expect(fireEvent.keyDown(button, { key: ' ' })).toBe(false);
    }
    stillPlaying();
  });
});

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

  it('runs the leaderboard track round the box whether it missed, asks for a name or shows the rank', () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(160);
    const track = () => document.querySelector('.leaderboard-panel > svg.leaderboard-track .leaderboard-track-train');

    saveDispatchBoard(fullBoard(1_000));
    const missed = renderSummary(failed(), judgement());
    expect(track()).not.toBeNull();
    missed.unmount();

    localStorage.clear();
    renderSummary(failed(), judgement());
    expect(track()).not.toBeNull();
    const input = screen.getByRole('textbox', { name: 'Your name' });
    fireEvent.change(input, { target: { value: 'Aina' } });
    fireEvent.submit(input.closest('form')!);
    expect(screen.getByRole('status').textContent).toMatch(/#1/);
    expect(track()).not.toBeNull();
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

  it('a retired Career is checked, then offered name entry like a failed one', () => {
    const retired: CareerState = { ...failed(), endReason: 'retired', failure: null };
    const { rerender } = renderSummary(retired, null);
    expect(screen.getByRole('heading', { name: 'Career retired' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Checking your Career…');
    rerender(<DispatchSummary net={net} career={retired} metrics={metrics} judgement={judgement()}
      onAgain={() => {}} onBack={() => {}} />);
    expect(screen.getByRole('textbox', { name: 'Your name' })).toBeTruthy();
  });

  it('an abandoned Career ends early', () => {
    renderSummary({ ...failed(), endReason: 'abandoned', failure: null }, null);
    expect(screen.queryByText('Checking your Career…')).toBeNull();
    expect(screen.getByText("Ended early — an abandoned Career can't enter the leaderboard.")).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Your name' })).toBeNull();
  });
});

describe('the dev camera panel', () => {
  const toggle = () => screen.getByRole('checkbox', { name: 'Close camera' }) as HTMLInputElement;
  const doneKeys = () => screen.getByTestId('dispatch-typing').querySelectorAll('[data-state="done"]').length;

  it('is on the Dispatcher screen, the close camera on by default', () => {
    localStorage.removeItem(DISPATCH_CAMERA_KEY);
    renderShift();
    expect(toggle().checked).toBe(true);
  });

  it('keeps its settings in browser storage', () => {
    const { unmount } = renderShift();
    fireEvent.click(toggle());
    unmount();
    renderShift();
    expect(toggle().checked).toBe(true);
  });

  it('falls back to the defaults when storage holds bad JSON', () => {
    localStorage.setItem(DISPATCH_CAMERA_KEY, '{');
    renderShift();
    expect(toggle().checked).toBe(true);
  });

  it('falls back to the defaults when storage throws', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    try {
      renderShift();
      expect(toggle().checked).toBe(true);
    } finally {
      getItem.mockRestore();
    }
  });

  it('typing after using the panel reaches the game', () => {
    renderShift(careerWith([waiting(1, 'KJ', 'Jelatek')]));
    toggle().focus();
    fireEvent.click(toggle());
    type('J');
    expect(doneKeys()).toBe(1);
  });

  it('a letter typed while a panel control has focus goes to the game, and lets go of the control', () => {
    renderShift(careerWith([waiting(1, 'KJ', 'Jelatek')]));
    // A click on a slider's label focuses the slider with no pointer-up on it.
    const slider = screen.getByRole('slider', { name: 'Early closeness' });
    slider.focus();
    fireEvent.keyDown(slider, { key: 'J' });
    expect(doneKeys()).toBe(1);
    expect(document.activeElement).not.toBe(slider);
  });

  it('a key a panel control uses stays in the panel', () => {
    renderShift(careerWith([waiting(1, 'KJ', 'Jelatek')]));
    type('J');
    toggle().focus();
    // Reaching the game, Space would be a wrong key for Jelatek and stall the line.
    fireEvent.keyDown(toggle(), { key: ' ' });
    expect(screen.getByTestId('dispatch-typing').getAttribute('data-stalled')).toBeNull();
    expect(doneKeys()).toBe(1);
  });
});
