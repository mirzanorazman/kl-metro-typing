import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { loadProfile } from '../engine/progress';
import { RushHourScreen } from './RushHourScreen';
import { RushSetup } from './RushSetup';
import { TypingInputProvider } from './TypingInputProvider';

const net = buildNetwork(loadNetworkData());
const type = (text: string) => {
  for (const ch of text) fireEvent.keyDown(window, { key: ch });
};
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
});

describe('RushHourScreen', () => {
  const renderRun = () => render(
    <TypingInputProvider enabled={false}>
      <RushHourScreen net={net} lineSet={['MR']} startAt="hang-tuah" onExit={() => {}} onAgain={() => {}} />
    </TypingInputProvider>,
  );

  it('starts on the first key and pauses on blur until resumed', () => {
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
    renderRun();
    type('Hang');
    fireEvent.click(screen.getByRole('button', { name: 'End run' }));
    expect(screen.getByRole('heading', { name: 'Run ended' })).toBeTruthy();
    expect(screen.getByText(/only a Run that ends in an Overflow can set a best/)).toBeTruthy();
    expect(loadProfile().rushHigh).toEqual({});
  });
});
