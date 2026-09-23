import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { beginTyping, applyKey } from '../engine/typing';
import { Prompt } from './Prompt';

describe('Prompt', () => {
  it('renders one element per character', () => {
    const { container } = render(<Prompt state={beginTyping('Imbi')} />);
    expect(container.querySelectorAll('[data-char]')).toHaveLength(4);
  });

  it('marks typed characters as done', () => {
    const s = applyKey(beginTyping('Imbi'), 'I');
    const { container } = render(<Prompt state={s} />);
    expect(container.querySelector('[data-char]')?.getAttribute('data-state')).toBe('done');
  });

  it('marks the current character', () => {
    const { container } = render(<Prompt state={beginTyping('Imbi')} />);
    expect(container.querySelector('[data-state="current"]')?.textContent).toBe('I');
  });

  it('shows a visible marker for a space so it is not invisible to type', () => {
    const { container } = render(<Prompt state={beginTyping('KL Sentral')} />);
    const chars = container.querySelectorAll('[data-char]');
    expect(chars[2]?.getAttribute('data-space')).toBe('true');
  });

  it('shows persistent wrong-key feedback for the current character', () => {
    const mistyped = applyKey(beginTyping('Imbi'), 'x');
    const { container } = render(<Prompt state={mistyped} />);

    expect(container.querySelector('[data-state="current"]')?.getAttribute('data-miskey')).toBe('true');
    expect(screen.getByRole('status').textContent).toBe('Wrong key');
  });

  it('clears wrong-key feedback after a correct character', () => {
    const mistyped = applyKey(beginTyping('Imbi'), 'x');
    const corrected = applyKey(mistyped, 'I');
    const { container, rerender } = render(<Prompt state={mistyped} />);

    rerender(<Prompt state={corrected} />);

    expect(container.querySelector('[data-miskey="true"]')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
