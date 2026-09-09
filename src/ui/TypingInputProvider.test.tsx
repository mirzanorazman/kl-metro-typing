import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TypingInputProvider,
  useGameInput,
  useTypingInputControls,
} from './TypingInputProvider';

interface ProbeProps {
  active?: boolean;
  onKey: (key: string) => void;
}

function Probe({ active = true, onKey }: ProbeProps) {
  useGameInput(onKey, active);
  const { focusInput, inputFocused } = useTypingInputControls();

  return (
    <>
      <button type="button" onClick={focusInput}>Focus input</button>
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
    expect(onKey).toHaveBeenCalledWith('a');
  });

  it('falls back to window keydown when no provider is mounted', () => {
    const onKey = vi.fn();
    render(<GameInputOnly onKey={onKey} />);

    fireEvent.keyDown(window, { key: 'a' });

    expect(onKey).toHaveBeenCalledWith('a');
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
    expect(replacement).toHaveBeenCalledWith('a');
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
