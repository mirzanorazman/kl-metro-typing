import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
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

  it('exposes recovery feedback outside the activation button', () => {
    const mistyped = applyKey(beginTyping('Imbi'), 'x');
    const { container } = render(<Prompt state={mistyped} onActivate={() => {}} />);
    const button = screen.getByRole('button', { name: 'Type Imbi' });
    const status = screen.getByRole('status');

    expect(button.contains(status)).toBe(false);
    expect(status.parentElement).toBe(button.parentElement);
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
  });

  it('keeps persistent error styling separate from reduced-motion animation suppression', () => {
    const css = readFileSync('src/index.css', 'utf8');
    const errorRuleSelector = ".prompt [data-state='current'][data-miskey='true']";
    const errorRuleStart = css.indexOf(errorRuleSelector);
    const errorRule = css.match(/\.prompt \[data-state='current'\]\[data-miskey='true'\]\s*\{([^}]+)\}/)?.[1];
    const reducedMotionStart = css.indexOf('@media (prefers-reduced-motion: reduce)');
    const reducedMotionCss = css.slice(reducedMotionStart);

    expect(errorRule).toMatch(/display:\s*inline-block/);
    expect(errorRule).toMatch(/color:\s*var\(--error\)/);
    expect(errorRule).toMatch(/border-bottom:\s*3px double var\(--error\)/);
    expect(errorRule).toMatch(/animation:\s*miskey/);
    expect(errorRuleStart).toBeGreaterThan(-1);
    expect(errorRuleStart).toBeLessThan(reducedMotionStart);
    expect(reducedMotionCss).toContain('animation-duration: 0.01ms !important');
    expect(reducedMotionCss).not.toMatch(/animation:\s*none/);
    expect(reducedMotionCss).not.toMatch(/(?:display|visibility):\s*(?:none|hidden)/);
    expect(css.indexOf('.prompt-feedback')).toBeLessThan(reducedMotionStart);
  });
});
