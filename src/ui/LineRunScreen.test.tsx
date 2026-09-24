import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { loadProfile } from '../engine/progress';
import { LineRunScreen } from './LineRunScreen';
import { TypingInputProvider } from './TypingInputProvider';
import * as runEngine from '../engine/run';

// jsdom cannot produce a trusted keyboard event (see TypingInputProvider.test.tsx),
// so a dispatched keydown always reports `isTrusted: false`. The leaderboard
// test below needs to simulate a legitimate, trusted player run, which no
// amount of fireEvent options can achieve — the DOM Event's `isTrusted` is a
// non-configurable own property jsdom sets at construction. Wrapping useKeyboard
// here is the standard escape hatch for an untestable browser primitive (the
// same reason this file already mocks `window.matchMedia`): every other
// behaviour of useKeyboard is preserved unchanged.
// Named (not inline) so the "untrusted keystrokes" describe block below can
// re-register it via `vi.doMock` after deliberately unmocking this module for
// one test — restoring every other test's normal, trusted-input behaviour.
async function trustedUseKeyboardMock(importOriginal: () => Promise<typeof import('./useKeyboard')>) {
  const actual = await importOriginal();
  return {
    ...actual,
    useKeyboard: (onKey: Parameters<typeof actual.useKeyboard>[0], active?: boolean) =>
      actual.useKeyboard((key, source) => onKey(key, { ...source, trusted: true }), active),
  };
}

vi.mock('./useKeyboard', trustedUseKeyboardMock);

const net = buildNetwork(loadNetworkData());
const type = (t: string) => { for (const ch of t) fireEvent.keyDown(window, { key: ch }); };

const TYPING_INTERVALS = [128, 191, 97, 164, 233, 112, 145, 178, 88, 205];

/**
 * Types with a mocked, varying clock so the resulting Keylog reads as human:
 * a real fireEvent-driven loop executes fast enough that consecutive
 * `performance.now()` reads round to the same millisecond, which trips
 * `impossible-speed` regardless of trust.
 */
function typeAsHuman(text: string, clock: { now: number }) {
  let i = 0;
  for (const ch of text) {
    clock.now += TYPING_INTERVALS[i++ % TYPING_INTERVALS.length]!;
    fireEvent.keyDown(window, { key: ch });
  }
}

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

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LineRunScreen', () => {
  it('retains native input batched with a rotation that ends the Line Run', () => {
    const content = (phoneLandscape: boolean) => (
      <TypingInputProvider enabled>
        <LineRunScreen net={net} line="MR" from="kl-sentral" onExit={() => {}}
          phoneLandscape={phoneLandscape} />
      </TypingInputProvider>
    );
    const { rerender } = render(content(false));
    const input = screen.getByRole('textbox', { name: 'Typing input for Station name' });

    act(() => {
      fireEvent.input(input, { target: { value: 'KL Sentral' } });
      rerender(content(true));
    });
    rerender(content(false));

    expect(screen.getByRole('heading', { name: 'Journey complete' })).toBeTruthy();
    expect(screen.getByText('1 station this run')).toBeTruthy();
    expect(loadProfile().visited).toContain('kl-sentral');
  });

  it('ends once on phone rotation and shows an incomplete summary only after portrait returns', () => {
    const onExit = vi.fn();
    const content = (phoneLandscape: boolean) => (
      <TypingInputProvider enabled>
        <LineRunScreen net={net} line="MR" from="kl-sentral" onExit={onExit}
          phoneLandscape={phoneLandscape} />
      </TypingInputProvider>
    );
    const { rerender } = render(content(false));
    const input = screen.getByRole('textbox', { name: 'Typing input for Station name' });
    act(() => input.focus());
    fireEvent.input(input, { target: { value: 'KL SentralT' } });
    const end = vi.spyOn(runEngine, 'endRun');
    const save = vi.spyOn(Storage.prototype, 'setItem');

    rerender(content(true));
    expect(screen.getByRole('status').textContent).toBe('Rotate to portrait to play');
    expect(screen.queryByLabelText(/^Type /)).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Journey complete' })).toBeNull();
    expect(document.activeElement).toBe(document.body);
    fireEvent.input(input, { target: { value: 'un Sambanthan' } });
    rerender(content(true));
    rerender(content(false));

    expect(screen.getByRole('heading', { name: 'Journey complete' })).toBeTruthy();
    expect(screen.getByText('1 station this run')).toBeTruthy();
    expect(screen.queryByLabelText(/your name/i)).toBeNull();
    expect(loadProfile().visited).not.toContain('tun-sambanthan');
    expect(end).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    rerender(content(true));
    expect(screen.getByRole('heading', { name: 'Journey complete' })).toBeTruthy();
    expect(end).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Back to the map' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

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
    // In an afterEach, not a trailing call in the test: a mockRestore that
    // only runs after every assertion passes leaves performance.now frozen
    // for the rest of the file the first time one of them throws.
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('invites the player to the leaderboard after completing the whole line', () => {
      const clock = { now: 0 };
      vi.spyOn(performance, 'now').mockImplementation(() => clock.now);
      renderLine({ line: 'MR', from: 'kl-sentral', onExit: () => {} });
      for (const name of MR_ROUTE_FROM_KL_SENTRAL) typeAsHuman(name, clock);
      expect(screen.getByLabelText(/your name/i)).toBeTruthy();
    });

    it('does not invite the player when the run ends early', () => {
      renderLine({ line: 'MR', from: 'kl-sentral', onExit: () => {} });
      type('KL Sentral');
      fireEvent.click(screen.getByRole('button', { name: /end run/i }));
      expect(screen.queryByLabelText(/your name/i)).toBeNull();
    });
  });

  // The rest of this file mocks `useKeyboard` to force `trusted: true`,
  // because jsdom cannot produce a trusted event and the tests above need to
  // simulate a legitimate player. That leaves an untrusted, driven-by-a-real-
  // screen run completely untested — the only coverage of "untrusted input
  // denies the leaderboard" lived at the unit level, against a synthetic
  // Keylog, in SummaryScreen.test.tsx. This is the deliberate exception: it
  // unmocks `useKeyboard` for one test so jsdom's real (always-untrusted)
  // `isTrusted` reaches the screen, then restores the mock afterwards.
  describe('untrusted keystrokes', () => {
    afterEach(() => {
      vi.doMock('./useKeyboard', trustedUseKeyboardMock);
      vi.resetModules();
    });

    it('denies the leaderboard, and records the failure, for a run typed with untrusted keystrokes', async () => {
      vi.doUnmock('./useKeyboard');
      vi.resetModules();
      const { LineRunScreen: RealLineRunScreen } = await import('./LineRunScreen');
      const { TypingInputProvider: RealProvider } = await import('./TypingInputProvider');

      render(
        <RealProvider enabled={false}>
          <RealLineRunScreen net={net} line="MR" from="kl-sentral" onExit={() => {}} />
        </RealProvider>,
      );

      for (const name of MR_ROUTE_FROM_KL_SENTRAL) type(name);

      expect(screen.getByText("This run wasn't eligible for the leaderboard.")).toBeTruthy();
      expect(screen.queryByLabelText(/your name/i)).toBeNull();

      const fails = loadProfile().integrityFails ?? [];
      expect(fails).toHaveLength(1);
      expect(fails[0]!.mode).toBe('line');
      expect(fails[0]!.reason).toBe('untrusted-input');
    });
  });
});
