import { readFileSync } from 'node:fs';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { emptyProfile, saveProfile } from '../engine/progress';
import { MobileAdventureSetup } from './MobileAdventureSetup';
import { TypingInputProvider } from './TypingInputProvider';

const net = buildNetwork(loadNetworkData());
const mobileStyles = readFileSync('src/ui/mobile.css', 'utf8');

function renderSetup(onStart: (stationId: string) => void = () => {}) {
  return render(
    <TypingInputProvider enabled>
      <MobileAdventureSetup net={net} onStart={onStart} />
    </TypingInputProvider>,
  );
}

beforeEach(() => localStorage.clear());

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('MobileAdventureSetup', () => {
  it('renders the geographic map and an expanded Adventure drawer', () => {
    const { container } = renderSetup();

    expect(container.querySelector('.mobile-map-screen .mobile-map-region .map-canvas')).toBeTruthy();
    expect(container.querySelectorAll('.mobile-map-region polyline[data-line]')).toHaveLength(7);
    expect(container.querySelector('.mobile-drawer')?.getAttribute('data-expanded')).toBe('true');
    expect(screen.getByText('Adventure', { selector: '.mobile-drawer-title' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Search stations' })).toBeTruthy();
  });

  it('offers a saved Imbi position without resuming automatically', () => {
    saveProfile({
      ...emptyProfile(),
      adventure: { at: 'imbi', arrivedFrom: 'bukit-bintang', line: 'MR' },
    });
    const onStart = vi.fn();
    renderSetup(onStart);

    expect(screen.getByRole('button', { name: 'Resume from Imbi' })).toBeTruthy();
    expect(onStart).not.toHaveBeenCalled();
  });

  it('focuses typing input before resuming from the saved station', () => {
    saveProfile({
      ...emptyProfile(),
      adventure: { at: 'imbi', arrivedFrom: 'bukit-bintang', line: 'MR' },
    });
    const onStart = vi.fn(() => {
      expect(document.activeElement).toBe(
        screen.getByRole('textbox', { name: 'Typing input for Station name' }),
      );
    });
    renderSetup(onStart);

    fireEvent.click(screen.getByRole('button', { name: 'Resume from Imbi' }));

    expect(onStart).toHaveBeenCalledOnce();
    expect(onStart).toHaveBeenCalledWith('imbi');
  });

  it('selects an Imbi search result and waits for the explicit Start action', () => {
    const onStart = vi.fn(() => {
      expect(document.activeElement).toBe(
        screen.getByRole('textbox', { name: 'Typing input for Station name' }),
      );
    });
    const { container } = renderSetup(onStart);
    fireEvent.change(screen.getByRole('textbox', { name: 'Search stations' }), {
      target: { value: 'Imbi' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Imbi/ }));

    expect(onStart).not.toHaveBeenCalled();
    expect(container.querySelector('[data-station="imbi"]')?.getAttribute('data-active')).toBe('true');
    expect(screen.getByRole('button', { name: 'Start Adventure' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Start Adventure' }));

    expect(onStart).toHaveBeenCalledOnce();
    expect(onStart).toHaveBeenCalledWith('imbi');
  });

  it('uses the scoped destination layout and touch-sized actions', () => {
    expect(mobileStyles).toMatch(
      /\.mobile-adventure-content\s*\{[^}]*display:\s*grid;[^}]*gap:\s*var\(--s\);/,
    );
    expect(mobileStyles).toMatch(
      /\.mobile-adventure-content button\s*\{[^}]*min-height:\s*44px;/,
    );
  });
});
