import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
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
});
