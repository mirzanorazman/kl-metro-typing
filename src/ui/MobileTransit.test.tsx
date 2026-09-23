import { readFileSync } from 'node:fs';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { loadNetworkData } from '../data/load';
import type { Line, LineCode } from '../data/types';
import { buildNetwork, type NetworkIndex } from '../engine/network';
import { emptyProfile, loadProfile, saveProfile } from '../engine/progress';
import { MobileTransit } from './MobileTransit';
import { TypingInputProvider } from './TypingInputProvider';

const mobileStyles = readFileSync('src/ui/mobile.css', 'utf8');

const net = buildNetwork(loadNetworkData());
const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
let scrollIntoView: Mock<[], void>;
let scrolledElements: HTMLElement[];

function renderTransit(
  network: NetworkIndex = net,
  onStartQuick: (line: LineCode, toward: string) => void = () => {},
  onStartLine: (line: LineCode, from: string) => void = () => {},
  phoneLandscape = false,
) {
  return render(
    <TypingInputProvider enabled>
      <MobileTransit
        net={network}
        onStartQuick={onStartQuick}
        onStartLine={onStartLine}
        phoneLandscape={phoneLandscape}
      />
    </TypingInputProvider>,
  );
}

function invalidNetwork(): NetworkIndex {
  const gombak = net.stations.get('gombak')!;
  const line: Line = {
    ...net.lines.get('KJ')!,
    termini: ['Gombak', 'Gombak'],
    stations: ['gombak'],
  };
  return {
    lines: new Map([['KJ', line]]),
    stations: new Map([['gombak', gombak]]),
    walk: new Map(),
    order: new Map([['KJ', new Map([['gombak', 0]])]]),
  };
}

beforeEach(() => {
  localStorage.clear();
  scrolledElements = [];
  scrollIntoView = vi.fn(function (this: HTMLElement) {
    scrolledElements.push(this);
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoView,
  });
});

afterEach(() => {
  if (originalScrollIntoView) {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView);
  } else {
    delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
  }
  vi.restoreAllMocks();
});

describe('MobileTransit', () => {
  it('disables Quick and Line starts in phone landscape while keeping line browsing available', () => {
    const onQuick = vi.fn();
    const onLine = vi.fn();
    renderTransit(net, onQuick, onLine, true);
    expect(screen.getByRole('status').textContent).toBe('Rotate to portrait to play');
    for (const name of ['Start 30s Quick Run', 'Full Line Run']) {
      const button = screen.getByRole('button', { name }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      fireEvent.click(button);
    }
    fireEvent.click(screen.getByRole('button', { name: 'KL Monorail' }));
    fireEvent.click(screen.getByRole('button', { name: 'Toward Titiwangsa' }));
    expect(screen.getByRole('button', { name: 'Toward Titiwangsa' }).getAttribute('aria-pressed')).toBe('true');
    expect(onQuick).not.toHaveBeenCalled();
    expect(onLine).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(screen.getByRole('textbox', { name: 'Typing input for Station name' }));
  });

  it('removes the map minimum height only for short coarse-pointer viewports', () => {
    expect(mobileStyles).toMatch(
      /\.mobile-map-region\s*\{[^}]*min-height:\s*8rem;/,
    );
    expect(mobileStyles).toMatch(
      /@media\s*\(pointer:\s*coarse\)\s*and\s*\(max-height:\s*700px\)\s*\{\s*\.mobile-map-region\s*\{\s*min-height:\s*0;\s*\}\s*\}/,
    );
  });

  it('renders the geographic map and all compact line pills in canonical order', () => {
    const { container } = renderTransit();
    const pills = [...container.querySelectorAll('.mobile-line-pills button')];

    expect(container.querySelectorAll('.mobile-map-region polyline[data-line]')).toHaveLength(7);
    expect(pills.map((pill) => pill.textContent)).toEqual(['KJ', 'AG', 'SP', 'SA', 'MR', 'KG', 'PY']);
    expect(pills.map((pill) => pill.getAttribute('aria-label'))).toEqual([
      'Kelana Jaya Line',
      'Ampang Line',
      'Sri Petaling Line',
      'Shah Alam Line',
      'KL Monorail',
      'Kajang Line',
      'Putrajaya Line',
    ]);
    expect(container.querySelector('.mobile-map-screen')?.children[0]?.className).toBe('mobile-map-region');
    expect(container.querySelector('.mobile-map-screen')?.children[1]?.className).toBe('mobile-line-pills');
    expect(container.querySelector('.mobile-map-screen')?.children[2]?.className).toBe('mobile-drawer');
  });

  it('defaults a fresh profile to KJ toward Gombak with expanded setup progress', () => {
    const { container } = renderTransit();

    expect(screen.getByRole('button', { name: 'Kelana Jaya Line' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Toward Gombak' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Toward Putra Heights' }).getAttribute('aria-pressed')).toBe('false');
    expect(container.querySelector('.mobile-drawer')?.getAttribute('data-expanded')).toBe('true');
    expect(screen.getByText('Kelana Jaya Line')).toBeTruthy();
    expect(screen.getByText('37 Stations · 0 unlocked')).toBeTruthy();
    expect(scrollIntoView).toHaveBeenCalledWith({ inline: 'center', block: 'nearest' });
    expect(scrolledElements[scrolledElements.length - 1]).toBe(
      screen.getByRole('button', { name: 'Kelana Jaya Line' }),
    );
  });

  it('restores a saved available line selection on mount', () => {
    saveProfile({ ...emptyProfile(), lastSelectedLine: 'PY' });

    renderTransit();

    expect(screen.getByRole('button', { name: 'Putrajaya Line' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Toward Kwasa Damansara' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Putrajaya Line')).toBeTruthy();
  });

  it('falls back to the first available canonical line when the saved line and KJ are absent', () => {
    saveProfile({ ...emptyProfile(), lastSelectedLine: 'AG' });
    const py = net.lines.get('PY')!;
    const pyNetwork: NetworkIndex = {
      ...net,
      lines: new Map([['PY', py]]),
      order: new Map([['PY', net.order.get('PY')!]]),
    };

    renderTransit(pyNetwork);

    expect(screen.getByRole('button', { name: 'Putrajaya Line' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Toward Kwasa Damansara' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('persists a new line, resets its direction, and centres its unchanged pill', () => {
    saveProfile({
      ...emptyProfile(),
      visited: ['gombak'],
      muted: true,
      lastSelectedLine: 'KJ',
    });
    renderTransit();
    fireEvent.click(screen.getByRole('button', { name: 'Toward Putra Heights' }));
    scrollIntoView.mockClear();
    scrolledElements.length = 0;
    const pyPill = screen.getByRole('button', { name: 'Putrajaya Line' });

    fireEvent.click(pyPill);

    expect(screen.getByRole('button', { name: 'Toward Kwasa Damansara' }).getAttribute('aria-pressed')).toBe('true');
    expect(loadProfile()).toMatchObject({
      lastSelectedLine: 'PY',
      visited: ['gombak'],
      muted: true,
    });
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ inline: 'center', block: 'nearest' });
    expect(scrolledElements[0]).toBe(pyPill);
  });

  it('starts a default Quick Run toward Gombak after focusing the hidden input', () => {
    const onStartQuick = vi.fn(() => {
      expect(document.activeElement).toBe(
        screen.getByRole('textbox', { name: 'Typing input for Station name' }),
      );
    });
    renderTransit(net, onStartQuick);

    fireEvent.click(screen.getByRole('button', { name: 'Start 30s Quick Run' }));

    expect(onStartQuick).toHaveBeenCalledWith('KJ', 'gombak');
  });

  it('starts a Quick Run toward the selected opposite direction', () => {
    const onStartQuick = vi.fn();
    renderTransit(net, onStartQuick);
    fireEvent.click(screen.getByRole('button', { name: 'Toward Putra Heights' }));

    fireEvent.click(screen.getByRole('button', { name: 'Start 30s Quick Run' }));

    expect(onStartQuick).toHaveBeenCalledWith('KJ', 'putra-heights');
  });

  it('starts a default Full Line Run at the opposite Putra Heights terminus after focusing input', () => {
    const onStartLine = vi.fn(() => {
      expect(document.activeElement).toBe(
        screen.getByRole('textbox', { name: 'Typing input for Station name' }),
      );
    });
    renderTransit(net, () => {}, onStartLine);

    fireEvent.click(screen.getByRole('button', { name: 'Full Line Run' }));

    expect(onStartLine).toHaveBeenCalledWith('KJ', 'putra-heights');
  });

  it('starts a Full Line Run at Gombak when traveling toward Putra Heights', () => {
    const onStartLine = vi.fn();
    renderTransit(net, () => {}, onStartLine);
    fireEvent.click(screen.getByRole('button', { name: 'Toward Putra Heights' }));

    fireEvent.click(screen.getByRole('button', { name: 'Full Line Run' }));

    expect(onStartLine).toHaveBeenCalledWith('KJ', 'gombak');
  });

  it('changes drawer state only from its chevron toggle, never from the map', () => {
    const { container } = renderTransit();
    const drawer = container.querySelector('.mobile-drawer')!;
    const map = container.querySelector('.mobile-map-region svg')!;

    fireEvent.click(map);
    expect(drawer.getAttribute('data-expanded')).toBe('true');

    fireEvent.click(container.querySelector('.mobile-drawer-chevron')!);
    expect(drawer.getAttribute('data-expanded')).toBe('false');
    expect(screen.getByText('Kelana Jaya Line')).toBeTruthy();
    expect(screen.getByText('37 Stations · 0 unlocked')).toBeTruthy();

    fireEvent.click(container.querySelector('.mobile-drawer-chevron')!);
    expect(drawer.getAttribute('data-expanded')).toBe('true');
  });

  it('shows only station and unlocked setup information, without run telemetry', () => {
    const { container } = renderTransit();

    expect(container.textContent).toContain('37 Stations · 0 unlocked');
    expect(container.textContent).not.toMatch(/distance|\bPB\b|\bWPM\b|accuracy/i);
  });

  it('disables both run actions and reports an invalid line without throwing', () => {
    renderTransit(invalidNetwork());

    expect(screen.getByRole('status').textContent).toBe('This Line is unavailable.');
    expect((screen.getByRole('button', { name: 'Start 30s Quick Run' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Full Line Run' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
