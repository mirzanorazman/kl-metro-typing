import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appendKey, beginLog, type KeySource } from '../engine/keylog';
import { verifyKeyLog } from '../engine/integrity';
import {
  TypingInputProvider,
  useGameInput,
  useTypingInputControls,
} from './TypingInputProvider';

interface ProbeProps {
  active?: boolean;
  onKey: (key: string, source: KeySource) => void;
}

function Probe({ active = true, onKey }: ProbeProps) {
  useGameInput(onKey, active);
  const { focusInput, blurInput, inputFocused } = useTypingInputControls();

  return (
    <>
      <button type="button" onClick={focusInput}>Focus input</button>
      <button type="button" onClick={blurInput}>Blur input</button>
      <output data-testid="focus-state">{inputFocused ? 'focused' : 'blurred'}</output>
    </>
  );
}

function GameInputOnly({ active = true, onKey }: ProbeProps) {
  useGameInput(onKey, active);
  return null;
}

function ControlsOnly() {
  useTypingInputControls();
  return null;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TypingInputProvider', () => {
  it('renders one phone-safe input after its children when enabled', () => {
    const { container } = render(
      <TypingInputProvider enabled>
        <div>Game screen</div>
        <Probe onKey={() => {}} />
      </TypingInputProvider>,
    );

    const input = screen.getByRole('textbox', { name: 'Typing input for Station name' });
    expect(container.querySelectorAll('input.mobile-typing-input')).toHaveLength(1);
    expect(input.getAttribute('autocomplete')).toBe('off');
    expect(input.getAttribute('autocapitalize')).toBe('none');
    expect(input.getAttribute('autocorrect')).toBe('off');
    expect(input.getAttribute('spellcheck')).toBe('false');
    expect(input.getAttribute('inputmode')).toBe('text');
    expect(container.lastElementChild).toBe(input);
  });

  it('focuses the input without scrolling and tracks focus and blur', () => {
    render(
      <TypingInputProvider enabled>
        <Probe onKey={() => {}} />
      </TypingInputProvider>,
    );
    const input = screen.getByRole('textbox', { name: 'Typing input for Station name' });
    const focus = vi.spyOn(input, 'focus');

    fireEvent.click(screen.getByRole('button', { name: 'Focus input' }));

    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(document.activeElement).toBe(input);
    expect(screen.getByTestId('focus-state').textContent).toBe('focused');

    fireEvent.blur(input);

    expect(screen.getByTestId('focus-state').textContent).toBe('blurred');
  });

  it('blurs the provider-owned input on request', () => {
    render(
      <TypingInputProvider enabled>
        <Probe onKey={() => {}} />
      </TypingInputProvider>,
    );
    const input = screen.getByRole('textbox', { name: 'Typing input for Station name' });
    act(() => input.focus());

    fireEvent.click(screen.getByRole('button', { name: 'Blur input' }));

    expect(document.activeElement).toBe(document.body);
    expect(screen.getByTestId('focus-state').textContent).toBe('blurred');
  });

  it('emits every character from repeated input values and clears the input', () => {
    const onKey = vi.fn();
    render(
      <TypingInputProvider enabled>
        <Probe onKey={onKey} />
      </TypingInputProvider>,
    );
    const input = screen.getByRole('textbox', { name: 'Typing input for Station name' });

    fireEvent.input(input, { target: { value: 'aa' } });
    fireEvent.input(input, { target: { value: 'a' } });

    expect(onKey.mock.calls.map(([key]) => key)).toEqual(['a', 'a', 'a']);
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('emits multi-code-unit Unicode characters in order', () => {
    const onKey = vi.fn();
    render(
      <TypingInputProvider enabled>
        <Probe onKey={onKey} />
      </TypingInputProvider>,
    );
    const input = screen.getByRole('textbox', { name: 'Typing input for Station name' });

    fireEvent.input(input, { target: { value: 'A🚆é' } });

    expect(onKey.mock.calls.map(([key]) => key)).toEqual(['A', '🚆', 'é']);
  });

  it('suppresses input during composition and emits the final value once', () => {
    const onKey = vi.fn();
    render(
      <TypingInputProvider enabled>
        <Probe onKey={onKey} />
      </TypingInputProvider>,
    );
    const input = screen.getByRole('textbox', { name: 'Typing input for Station name' });

    fireEvent.compositionStart(input);
    fireEvent.input(input, { target: { value: '東京' } });

    expect(onKey).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe('東京');

    fireEvent.compositionEnd(input, { data: '東京' });
    fireEvent.input(input, { target: { value: '' } });

    expect(onKey.mock.calls.map(([key]) => key)).toEqual(['東', '京']);
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('does not also respond to window keydown when enabled', () => {
    const onKey = vi.fn();
    render(
      <TypingInputProvider enabled>
        <Probe onKey={onKey} />
      </TypingInputProvider>,
    );

    fireEvent.keyDown(window, { key: 'a' });

    expect(onKey).not.toHaveBeenCalled();
  });

  it('recovers ordinary input after disabling during composition', () => {
    const onKey = vi.fn();
    const probe = (enabled: boolean) => (
      <TypingInputProvider enabled={enabled}>
        <Probe onKey={onKey} />
      </TypingInputProvider>
    );
    const { rerender } = render(probe(true));
    const originalInput = screen.getByRole('textbox');
    fireEvent.click(screen.getByRole('button', { name: 'Focus input' }));
    fireEvent.compositionStart(originalInput);
    fireEvent.input(originalInput, { target: { value: '東' } });
    expect(screen.getByTestId('focus-state').textContent).toBe('focused');
    expect(onKey).not.toHaveBeenCalled();

    rerender(probe(false));
    expect(screen.queryByRole('textbox')).toBeNull();
    expect.soft(screen.getByTestId('focus-state').textContent).toBe('blurred');

    rerender(probe(true));
    const replacementInput = screen.getByRole('textbox');
    expect(replacementInput).not.toBe(originalInput);
    expect.soft(screen.getByTestId('focus-state').textContent).toBe('blurred');
    fireEvent.input(replacementInput, { target: { value: 'a' } });

    expect(onKey).toHaveBeenCalledTimes(1);
    expect(onKey).toHaveBeenCalledWith('a', { trusted: false, batch: 1 });
    expect((replacementInput as HTMLInputElement).value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Focus input' }));
    expect(screen.getByTestId('focus-state').textContent).toBe('focused');
  });

  it('renders no input and falls back to window keydown when disabled', () => {
    const onKey = vi.fn();
    const focus = vi.spyOn(HTMLInputElement.prototype, 'focus');
    render(
      <TypingInputProvider enabled={false}>
        <Probe onKey={onKey} />
      </TypingInputProvider>,
    );

    expect(screen.queryByRole('textbox', { name: 'Typing input for Station name' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Focus input' }));
    fireEvent.keyDown(window, { key: 'a' });

    expect(focus).not.toHaveBeenCalled();
    expect(onKey).toHaveBeenCalledWith('a', { trusted: false, batch: 1 });
  });

  it('falls back to window keydown when no provider is mounted', () => {
    const onKey = vi.fn();
    render(<GameInputOnly onKey={onKey} />);

    fireEvent.keyDown(window, { key: 'a' });

    expect(onKey).toHaveBeenCalledWith('a', { trusted: false, batch: 1 });
  });

  it('suppresses both native input and window keydown when inactive', () => {
    const onKey = vi.fn();
    render(
      <TypingInputProvider enabled>
        <Probe active={false} onKey={onKey} />
      </TypingInputProvider>,
    );
    const input = screen.getByRole('textbox', { name: 'Typing input for Station name' });

    fireEvent.input(input, { target: { value: 'a' } });
    fireEvent.keyDown(window, { key: 'b' });

    expect(onKey).not.toHaveBeenCalled();
  });

  it('does not let an old cleanup clear a replacement handler', () => {
    const first = vi.fn();
    const replacement = vi.fn();

    function RegistrationPhase({ phase }: { phase: 1 | 2 | 3 }) {
      return (
        <TypingInputProvider enabled>
          {phase < 3 && <GameInputOnly key="first" onKey={first} />}
          {phase >= 2 && <GameInputOnly key="replacement" onKey={replacement} />}
        </TypingInputProvider>
      );
    }

    const { rerender } = render(<RegistrationPhase phase={1} />);
    rerender(<RegistrationPhase phase={2} />);
    rerender(<RegistrationPhase phase={3} />);
    const input = screen.getByRole('textbox', { name: 'Typing input for Station name' });

    fireEvent.input(input, { target: { value: 'a' } });

    expect(first).not.toHaveBeenCalled();
    expect(replacement).toHaveBeenCalledWith('a', { trusted: false, batch: 1 });
  });

  it('throws a clear error when controls are used outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<ControlsOnly />)).toThrowError('TypingInputProvider is missing');
  });

  it('safely drops input when no handler is active', () => {
    render(
      <TypingInputProvider enabled>
        <div>Game screen</div>
      </TypingInputProvider>,
    );
    const input = screen.getByRole('textbox', { name: 'Typing input for Station name' });

    expect(() => fireEvent.input(input, { target: { value: 'abc' } })).not.toThrow();
    expect((input as HTMLInputElement).value).toBe('');
  });
});

describe('keystroke provenance', () => {
  function renderProbe(onKey: (key: string, source: KeySource) => void, enabled = true) {
    return render(
      <TypingInputProvider enabled={enabled}>
        <GameInputOnly onKey={onKey} />
      </TypingInputProvider>,
    );
  }

  it('reports how many characters one input event delivered, on the first character only', () => {
    // A paste arrives as a single input event carrying the whole name. Only
    // the first character's Source carries the count — the rest carry 1 —
    // so a log built from this reports one flagged event per burst, not one
    // per character (see the fixed count of flagged events verifyKeyLog
    // judges against).
    const received: { key: string; batch: number }[] = [];
    renderProbe((key, source) => received.push({ key, batch: source.batch }));

    const input = screen.getByLabelText('Typing input for Station name') as HTMLInputElement;
    fireEvent.input(input, { target: { value: 'abc' } });

    expect(received).toEqual([
      { key: 'a', batch: 3 },
      { key: 'b', batch: 1 },
      { key: 'c', batch: 1 },
    ]);
  });

  it('reports an ordinary single keystroke as a batch of one', () => {
    const received: { key: string; batch: number }[] = [];
    renderProbe((key, source) => received.push({ key, batch: source.batch }));

    const input = screen.getByLabelText('Typing input for Station name') as HTMLInputElement;
    fireEvent.input(input, { target: { value: 'a' } });

    expect(received).toEqual([{ key: 'a', batch: 1 }]);
  });

  // jsdom cannot produce a trusted event, so a dispatched keydown is exactly
  // the synthetic case this check exists to catch.
  it('marks a dispatched keydown as untrusted', () => {
    const received: boolean[] = [];
    renderProbe((_key, source) => received.push(source.trusted), false);

    fireEvent.keyDown(window, { key: 'a' });

    expect(received).toEqual([false]);
  });

  // Regression coverage for the defect this file's encoding used to have:
  // every character of a burst carried the full batch size, so a real
  // predictive-keyboard run inflated verifyKeyLog's flagged-event count by
  // the burst width rather than by one per burst. Driving real two-character
  // bursts through the provider and replaying the emitted Sources into an
  // actual Keylog is what would have caught it — a hand-built fixture, as
  // the one this defect escaped past did, cannot exercise the encoder.
  it('lets six real two-character predictive-keyboard bursts still verify ok', () => {
    const received: KeySource[] = [];
    renderProbe((_key, source) => received.push(source));

    const input = screen.getByLabelText('Typing input for Station name') as HTMLInputElement;
    for (let i = 0; i < 6; i++) {
      fireEvent.input(input, { target: { value: 'ab' } });
    }

    expect(received).toHaveLength(12);
    // One flagged Source per burst, not two: the shape maxBatchedEvents is
    // specified against.
    expect(received.filter((s) => s.batch > 1)).toHaveLength(6);

    let log = beginLog(0);
    let now = 0;
    for (const source of received) {
      now += 100;
      // Trust is a separate, already-covered concern; only the batching
      // behaviour under test is carried over from the captured Source.
      log = appendKey(log, 'a', { trusted: true, batch: source.batch }, now);
    }
    // Pad past the minimum sample size the validator requires before it
    // judges anything.
    for (let i = 0; i < 10; i++) {
      now += 100;
      log = appendKey(log, 'a', { trusted: true, batch: 1 }, now);
    }

    expect(verifyKeyLog(log, 80)).toEqual({ ok: true });
  });
});
