import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { emptyProfile, loadProfile, markRushTipSeen, saveProfile } from '../engine/progress';
import { enterRushCharacter, rushSuggestedStart, startRush, type RushState } from '../engine/rushHour';
import { RushHourScreen } from './RushHourScreen';
import { RushJunction } from './RushJunction';
import { RushSetup } from './RushSetup';
import { RUSH_TIPS } from './rushTips';
import { TypingInputProvider } from './TypingInputProvider';

const net = buildNetwork(loadNetworkData());
const type = (text: string) => {
  for (const ch of text) fireEvent.keyDown(window, { key: ch });
};
const seeAllTips = () => saveProfile({ ...emptyProfile(), rushTipsSeen: RUSH_TIPS.map((t) => t.id) });
const originalRect = Element.prototype.getBoundingClientRect;

beforeEach(() => {
  localStorage.clear();
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

describe('RushSetup', () => {
  it('toggles Lines by code, then offers only Stations on the Line set', () => {
    const onStart = vi.fn();
    render(<RushSetup net={net} onStart={onStart} onBack={() => {}} />);
    const start = screen.getByRole('button', { name: /Choose a starting station/ });
    expect((start as HTMLButtonElement).disabled).toBe(true);

    type('MR');
    expect(screen.getByRole('button', { name: /Monorail/ }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(window, { key: 'Enter' });

    const search = screen.getByRole('textbox', { name: 'Search stations' });
    fireEvent.change(search, { target: { value: 'gombak' } });
    expect(screen.queryByRole('button', { name: /Gombak/ })).toBeNull();
    fireEvent.change(search, { target: { value: 'hang tuah' } });
    fireEvent.click(screen.getByRole('button', { name: /Hang Tuah/ }));
    expect(onStart).toHaveBeenCalledWith(['MR'], 'hang-tuah');
  });

  it('labels the steps and starts at the suggested Station on Enter', () => {
    const onStart = vi.fn();
    render(<RushSetup net={net} onStart={onStart} onBack={() => {}} />);
    expect(screen.getByRole('heading', { name: '1 · Lines' })).toBeTruthy();
    type('MR');
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByRole('heading', { name: /2 · Start station/ })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Search stations' }), { key: 'Enter' });
    expect(onStart).toHaveBeenCalledWith(['MR'], rushSuggestedStart(net, ['MR']));
  });

  it('How to play brings the tips back', () => {
    saveProfile(markRushTipSeen(emptyProfile(), 'junction'));
    render(<RushSetup net={net} onStart={() => {}} onBack={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /How to play/ }));
    expect(loadProfile().rushTipsSeen).toEqual([]);
    expect(screen.getByText(/Tips will show on your next Run/)).toBeTruthy();
  });
});

describe('RushHourScreen', () => {
  const renderRun = () => render(
    <TypingInputProvider enabled={false}>
      <RushHourScreen net={net} lineSet={['MR']} startAt="hang-tuah" onExit={() => {}} onAgain={() => {}} />
    </TypingInputProvider>,
  );

  it('starts on the first key and pauses on blur until resumed', () => {
    seeAllTips();
    renderRun();
    expect(screen.getByText(/Day 1 · Off-Peak/)).toBeTruthy();
    type('Hang');
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(screen.getByRole('dialog', { name: 'Paused' })).toBeTruthy();
    type('Tuah');
    fireEvent.click(screen.getByRole('button', { name: /Resume/ }));
    expect(screen.queryByRole('dialog', { name: 'Paused' })).toBeNull();
    type(' Tuah');
    expect(screen.getByRole('group', { name: 'Choose a direction' })).toBeTruthy();
  });

  it('shows a summary and never saves a best for an abandoned Run', () => {
    seeAllTips();
    renderRun();
    type('Hang');
    fireEvent.click(screen.getByRole('button', { name: 'End run' }));
    expect(screen.getByRole('heading', { name: 'Run ended' })).toBeTruthy();
    expect(screen.getByText(/only a Run that ends in an Overflow can set a best/)).toBeTruthy();
    expect(loadProfile().rushHigh).toEqual({});
  });

  it('shows the start tip, then freezes on the first Junction until a key dismisses the tip', () => {
    renderRun();
    expect(screen.getByText('Type the station name to start. Passengers appear near your train.')).toBeTruthy();
    type('Hang Tuah');
    expect(screen.queryByText(/Passengers appear near your train/)).toBeNull();

    const tip = screen.getByRole('dialog', { name: 'Tip' });
    expect(tip.textContent).toMatch(/Pick a way by its number/);
    expect(screen.queryByRole('group', { name: 'Choose a direction' })).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Paused' })).toBeNull();

    fireEvent.keyDown(window, { key: 'x' });
    expect(screen.queryByRole('dialog', { name: 'Tip' })).toBeNull();
    expect(screen.getByRole('group', { name: 'Choose a direction' })).toBeTruthy();
    expect(loadProfile().rushTipsSeen).toEqual(expect.arrayContaining(['start', 'junction']));
  });

  it('shows each tip only once', () => {
    saveProfile({ ...emptyProfile(), rushTipsSeen: ['start', 'junction'] });
    renderRun();
    expect(screen.queryByText(/Passengers appear near your train/)).toBeNull();
    type('Hang Tuah');
    expect(screen.queryByRole('dialog', { name: 'Tip' })).toBeNull();
    expect(screen.getByRole('group', { name: 'Choose a direction' })).toBeTruthy();
  });
});

describe('RushJunction', () => {
  /** A quiet KJ+KG Run standing at the KL Sentral Junction, which also offers a Walk. */
  const atKlSentral = (): RushState => {
    let s: RushState = { ...startRush(net, ['KJ', 'KG'], 'kl-sentral', 3), spawnDebt: -1e9 };
    for (const ch of s.typing.target) s = enterRushCharacter(net, s, ch, 1_000);
    return s;
  };

  it('shows one compact row per way, with Walks numbered after the rails', () => {
    let run = atKlSentral();
    const first = run.options[0]!;
    run = {
      ...run,
      load: [{ id: 1, target: first.line }],
      queues: { ...run.queues, [first.next]: { passengers: [{ id: 2, target: 'AG' }], overflowMs: 500 } },
    };
    const onChoose = vi.fn();
    const onWalk = vi.fn();
    render(
      <TypingInputProvider enabled={false}>
        <RushJunction net={net} run={run} onChoose={onChoose} onWalk={onWalk} />
      </TypingInputProvider>,
    );

    const rows = screen.getAllByRole('button');
    expect(rows).toHaveLength(run.options.length + 1);
    expect(rows[0]!.textContent).toContain('↓1');
    expect(screen.queryByText(/toward/)).toBeNull();
    const pips = rows[0]!.querySelector('.rush-pips')!;
    expect(pips.getAttribute('data-filling')).toBe('true');
    expect(pips.getAttribute('aria-label')).toMatch(/^1 of \d+ waiting$/);

    const walkKey = String(run.options.length + 1);
    expect(rows[run.options.length]!.textContent).toContain(`${walkKey}🚶Walk to Muzium Negara`);
    fireEvent.keyDown(window, { key: walkKey });
    expect(onWalk).toHaveBeenCalledWith('muzium-negara');
    fireEvent.keyDown(window, { key: '1' });
    expect(onChoose).toHaveBeenCalledWith(first);
  });
});
