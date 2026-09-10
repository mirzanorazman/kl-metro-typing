import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { loadProfile } from '../engine/progress';
import { AdventureScreen } from './AdventureScreen';
import { TypingInputProvider } from './TypingInputProvider';

const net = buildNetwork(loadNetworkData());
const type = (text: string) => {
  for (const ch of text) fireEvent.keyDown(window, { key: ch });
};

const originalRect = Element.prototype.getBoundingClientRect;

function renderAdventure(
  props: { startAt: string; onExit: () => void },
) {
  return render(
    <TypingInputProvider enabled={false}>
      <AdventureScreen net={net} {...props} />
    </TypingInputProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  // jsdom has no layout, and the follow camera sizes itself in what the
  // player sees; reduced motion lands each fit immediately.
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

afterEach(() => { Element.prototype.getBoundingClientRect = originalRect; });

describe('AdventureScreen', () => {
  it('shows the start station name to type', () => {
    renderAdventure({ startAt: 'imbi', onExit: () => {} });
    expect(screen.getByLabelText('Type Imbi')).toBeTruthy();
  });

  it('opens the junction picker once the name is typed', () => {
    renderAdventure({ startAt: 'imbi', onExit: () => {} });
    type('Imbi');
    expect(screen.getByRole('group', { name: /choose a direction/i })).toBeTruthy();
  });

  it('advances from native input inside the typing provider', () => {
    render(
      <TypingInputProvider enabled>
        <AdventureScreen net={net} startAt="imbi" onExit={() => {}} />
      </TypingInputProvider>,
    );

    fireEvent.input(
      screen.getByRole('textbox', { name: 'Typing input for Station name' }),
      { target: { value: 'Imbi' } },
    );

    expect(screen.getByRole('group', { name: /choose a direction/i })).toBeTruthy();
  });

  it('recovers native typing from the initial phone prompt after blur', () => {
    render(
      <TypingInputProvider enabled>
        <AdventureScreen net={net} startAt="imbi" onExit={() => {}} />
      </TypingInputProvider>,
    );
    const input = screen.getByRole('textbox', { name: 'Typing input for Station name' });
    act(() => input.focus());
    fireEvent.blur(input);

    fireEvent.click(screen.getByRole('button', { name: 'Type Imbi' }));

    expect(document.activeElement).toBe(input);
    expect(screen.queryByRole('group', { name: /choose a direction/i })).toBeNull();
  });

  it('persists every station completed in one native input event and the final position', () => {
    render(
      <TypingInputProvider enabled>
        <AdventureScreen net={net} startAt="kl-sentral" onExit={() => {}} />
      </TypingInputProvider>,
    );
    const input = screen.getByRole('textbox', { name: 'Typing input for Station name' });

    fireEvent.input(input, { target: { value: 'KL Sentral' } });
    fireEvent.click(screen.getByRole('button', { name: /toward Titiwangsa/i }));
    fireEvent.input(input, { target: { value: 'Tun SambanthanMaharajalela' } });

    expect(loadProfile().visited).toEqual(
      expect.arrayContaining(['kl-sentral', 'tun-sambanthan', 'maharajalela']),
    );
    expect(loadProfile().adventure).toMatchObject({
      at: 'hang-tuah',
      arrivedFrom: 'maharajalela',
      line: 'MR',
    });
  });

  it('releases the native input when the adventure ends', () => {
    render(
      <TypingInputProvider enabled>
        <AdventureScreen net={net} startAt="imbi" onExit={() => {}} />
      </TypingInputProvider>,
    );
    const input = screen.getByRole('textbox', { name: 'Typing input for Station name' });
    act(() => input.focus());

    fireEvent.click(screen.getByRole('button', { name: 'End journey' }));

    expect(document.activeElement).toBe(document.body);
  });

  it('offers a phone turn-around button that focuses input before returning', () => {
    render(
      <TypingInputProvider enabled>
        <AdventureScreen net={net} startAt="imbi" onExit={() => {}} />
      </TypingInputProvider>,
    );
    const input = screen.getByRole('textbox', { name: 'Typing input for Station name' });

    fireEvent.input(input, { target: { value: 'Imbi' } });
    fireEvent.click(screen.getByRole('group', { name: /choose a direction/i }).querySelector('button')!);

    const turnAround = screen.getByRole('button', { name: 'Turn around' });
    expect(turnAround.classList.contains('mobile-turn-around')).toBe(true);
    fireEvent.click(turnAround);

    expect(document.activeElement).toBe(input);
    expect(screen.getByLabelText('Type Imbi')).toBeTruthy();
  });

  it('keeps the desktop Backspace turn-around shortcut', () => {
    window.matchMedia = ((q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    renderAdventure({ startAt: 'imbi', onExit: () => {} });
    type('Imbi');
    fireEvent.click(screen.getByRole('group', { name: /choose a direction/i }).querySelector('button')!);

    expect(screen.getByText('Backspace', { selector: 'kbd' }).parentElement?.textContent).toMatch(
      /Backspace.*turn around/i,
    );
    fireEvent.keyDown(window, { key: 'Backspace' });

    expect(screen.getByLabelText('Type Imbi')).toBeTruthy();
  });

  it('persists the visited station', () => {
    renderAdventure({ startAt: 'imbi', onExit: () => {} });
    type('Imbi');
    expect(loadProfile().visited).toContain('imbi');
  });

  it('rides at close-up zoom rather than framing the whole network', async () => {
    const { container } = renderAdventure({ startAt: 'imbi', onExit: () => {} });
    // Adventure passes no fitTo at all, so before the follow camera it ran the
    // entire game at whole-network zoom — worse than a long line run.
    await waitFor(() => {
      const [, , w, h] = container.querySelector('svg.map-canvas')!
        .getAttribute('viewBox')!
        .split(' ')
        .map(Number) as [number, number, number, number];
      expect(Math.max(w, h)).toBeLessThanOrEqual(420);
    });
  });

  it('frames the stations a junction could take you to', async () => {
    const { container } = renderAdventure({ startAt: 'imbi', onExit: () => {} });
    type('Imbi');
    await waitFor(() => {
      const [x, y, w, h] = container.querySelector('svg.map-canvas')!
        .getAttribute('viewBox')!
        .split(' ')
        .map(Number) as [number, number, number, number];
      expect(Math.max(w, h)).toBeLessThanOrEqual(420);
      const candidates = container.querySelectorAll('circle[data-next="true"]');
      expect(candidates.length).toBeGreaterThan(0);
      for (const mark of candidates) {
        expect(Number(mark.getAttribute('cx'))).toBeGreaterThanOrEqual(x);
        expect(Number(mark.getAttribute('cx'))).toBeLessThanOrEqual(x + w);
        expect(Number(mark.getAttribute('cy'))).toBeGreaterThanOrEqual(y);
        expect(Number(mark.getAttribute('cy'))).toBeLessThanOrEqual(y + h);
      }
    });
  });

  it('keeps geographic watermarks off the schematic diagram', () => {
    const { container } = renderAdventure({ startAt: 'kl-sentral', onExit: () => {} });
    // Adventure opens in schematic mode, where a lat/lng-anchored district
    // name would float at a position the diagram does not share.
    expect(container.querySelectorAll('text[data-watermark]')).toHaveLength(0);
  });
});
