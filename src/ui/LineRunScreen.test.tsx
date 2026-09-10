import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { loadProfile } from '../engine/progress';
import { LineRunScreen } from './LineRunScreen';
import { TypingInputProvider } from './TypingInputProvider';

const net = buildNetwork(loadNetworkData());
const type = (t: string) => { for (const ch of t) fireEvent.keyDown(window, { key: ch }); };

const MR_ROUTE_FROM_KL_SENTRAL = [
  'KL Sentral', 'Tun Sambanthan', 'Maharajalela', 'Hang Tuah', 'Imbi',
  'Bukit Bintang', 'Raja Chulan', 'Bukit Nanas', 'Medan Tuanku', 'Chow Kit', 'Titiwangsa',
];

function renderLine(props: { line: 'MR' | 'PY'; from: string; onExit: () => void }) {
  return render(
    <TypingInputProvider enabled={false}>
      <LineRunScreen net={net} {...props} />
    </TypingInputProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  // Skips the 1.1s post-completion celebration delay so completion tests
  // don't need real timers.
  window.matchMedia = ((q: string) => ({
    matches: true, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

describe('LineRunScreen', () => {
  it('starts at the chosen terminus', () => {
    renderLine({ line: 'MR', from: 'kl-sentral', onExit: () => {} });
    expect(screen.getByLabelText('Type KL Sentral')).toBeTruthy();
  });

  it('advances along the line without asking for a direction', () => {
    renderLine({ line: 'MR', from: 'kl-sentral', onExit: () => {} });
    type('KL Sentral');
    expect(screen.getByLabelText('Type Tun Sambanthan')).toBeTruthy();
    expect(screen.queryByRole('group', { name: /choose a direction/i })).toBeNull();
  });

  it('advances from native input inside the typing provider', () => {
    render(
      <TypingInputProvider enabled>
        <LineRunScreen net={net} line="MR" from="kl-sentral" onExit={() => {}} />
      </TypingInputProvider>,
    );

    fireEvent.input(
      screen.getByRole('textbox', { name: 'Typing input for Station name' }),
      { target: { value: 'KL Sentral' } },
    );

    expect(screen.getByLabelText('Type Tun Sambanthan')).toBeTruthy();
  });

  it('recovers native typing when the phone prompt is tapped after blur', () => {
    render(
      <TypingInputProvider enabled>
        <LineRunScreen net={net} line="MR" from="kl-sentral" onExit={() => {}} />
      </TypingInputProvider>,
    );
    const input = screen.getByRole('textbox', { name: 'Typing input for Station name' });
    act(() => input.focus());
    fireEvent.blur(input);

    fireEvent.click(screen.getByRole('button', { name: 'Type KL Sentral' }));

    expect(document.activeElement).toBe(input);
  });

  it('keeps the desktop prompt noninteractive', () => {
    window.matchMedia = ((q: string) => ({
      matches: false, media: q, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    renderLine({ line: 'MR', from: 'kl-sentral', onExit: () => {} });

    expect(screen.getByLabelText('Type KL Sentral').tagName).toBe('DIV');
    expect(screen.queryByRole('button', { name: 'Type KL Sentral' })).toBeNull();
  });

  it('persists every station completed in one native input event', () => {
    render(
      <TypingInputProvider enabled>
        <LineRunScreen net={net} line="MR" from="kl-sentral" onExit={() => {}} />
      </TypingInputProvider>,
    );
    const input = screen.getByRole('textbox', { name: 'Typing input for Station name' });

    fireEvent.input(input, { target: { value: 'KL SentralTun Sambanthan' } });

    expect(loadProfile().visited).toEqual(expect.arrayContaining(['kl-sentral', 'tun-sambanthan']));
  });

  it('releases the native input when the line run ends', () => {
    render(
      <TypingInputProvider enabled>
        <LineRunScreen net={net} line="MR" from="kl-sentral" onExit={() => {}} />
      </TypingInputProvider>,
    );
    const input = screen.getByRole('textbox', { name: 'Typing input for Station name' });
    act(() => input.focus());

    fireEvent.click(screen.getByRole('button', { name: 'End run' }));

    expect(document.activeElement).toBe(document.body);
  });

  it('persists each visited station', () => {
    renderLine({ line: 'MR', from: 'kl-sentral', onExit: () => {} });
    type('KL Sentral');
    expect(loadProfile().visited).toContain('kl-sentral');
  });

  it('does not write an adventure resume position', () => {
    renderLine({ line: 'MR', from: 'kl-sentral', onExit: () => {} });
    type('KL Sentral');
    expect(loadProfile().adventure).toBeNull();
  });

  describe('camera', () => {
    // jsdom has no layout, so the canvas is told what shape it is; the follow
    // camera sizes itself in what the player sees, which needs a viewport.
    const VIEWPORT_ASPECT = 1512 / 690;
    const original = Element.prototype.getBoundingClientRect;
    beforeEach(() => {
      Element.prototype.getBoundingClientRect = function () {
        return { x: 0, y: 0, top: 0, left: 0, right: 1512, bottom: 690,
          width: 1512, height: 690, toJSON: () => ({}) } as DOMRect;
      };
    });
    // Restored, or every later test file inherits this viewport.
    afterEach(() => { Element.prototype.getBoundingClientRect = original; });

    const viewBoxOf = (container: HTMLElement) =>
      container.querySelector('svg.map-canvas')!
        .getAttribute('viewBox')!
        .split(' ')
        .map(Number) as [number, number, number, number];

    // The Putrajaya line spans 334x642 layout units. Framed whole, with the
    // typing panel's padding, that is a 924-unit-tall shot — the overview map
    // the player was already looking at, which is what made long lines feel
    // like nothing was happening.
    it('rides a long line at close-up zoom rather than framing the whole line', async () => {
      const { container } = renderLine({ line: 'PY', from: 'kwasa-damansara', onExit: () => {} });
      type('Kwasa Damansara');
      await waitFor(() => {
        const [, , w, h] = viewBoxOf(container);
        expect(Math.max(w, h)).toBeLessThanOrEqual(420);
      });
    });

    // The reference the camera is built against shows a couple of stations
    // behind and the next few ahead — enough to read where you are going,
    // few enough that the names are legible.
    it('shows the stretch around the train, not the whole line', async () => {
      const { container } = renderLine({ line: 'PY', from: 'kwasa-damansara', onExit: () => {} });
      type('Kwasa DamansaraKampung SelamatSungai Buloh');
      await waitFor(() => {
        const [x, y, w, h] = viewBoxOf(container);
        expect(w / h).toBeCloseTo(VIEWPORT_ASPECT, 1);
        const onLine = net.lines.get('PY')!.stations.filter((id) => {
          const mark = container.querySelector(`circle[data-station="${id}"]`);
          if (!mark) return false;
          const cx = Number(mark.getAttribute('cx'));
          const cy = Number(mark.getAttribute('cy'));
          return cx >= x && cx <= x + w && cy >= y && cy <= y + h;
        });
        expect(onLine.length).toBeGreaterThanOrEqual(4);
        expect(onLine.length).toBeLessThanOrEqual(8);
      });
    });

    it('keeps the station being typed in shot', async () => {
      const { container } = renderLine({ line: 'PY', from: 'kwasa-damansara', onExit: () => {} });
      type('Kwasa Damansara');
      await waitFor(() => {
        const [x, y, w, h] = viewBoxOf(container);
        // Only meaningful at close-up zoom; the whole-line frame contains
        // every station trivially.
        expect(Math.max(w, h)).toBeLessThanOrEqual(420);
        const mark = container.querySelector('circle[data-station="kampung-selamat"]')!;
        const cx = Number(mark.getAttribute('cx'));
        const cy = Number(mark.getAttribute('cy'));
        expect(cx).toBeGreaterThanOrEqual(x);
        expect(cx).toBeLessThanOrEqual(x + w);
        expect(cy).toBeGreaterThanOrEqual(y);
        expect(cy).toBeLessThanOrEqual(y + h);
      });
    });
  });

  describe('leaderboard', () => {
    it('invites the player to the leaderboard after completing the whole line', () => {
      renderLine({ line: 'MR', from: 'kl-sentral', onExit: () => {} });
      for (const name of MR_ROUTE_FROM_KL_SENTRAL) type(name);
      expect(screen.getByLabelText(/your name/i)).toBeTruthy();
    });

    it('does not invite the player when the run ends early', () => {
      renderLine({ line: 'MR', from: 'kl-sentral', onExit: () => {} });
      type('KL Sentral');
      fireEvent.click(screen.getByRole('button', { name: /end run/i }));
      expect(screen.queryByLabelText(/your name/i)).toBeNull();
    });
  });
});
