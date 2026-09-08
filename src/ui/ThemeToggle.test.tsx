import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeToggle } from './ThemeToggle';

describe('ThemeToggle', () => {
  it('names the atmosphere it will switch to', () => {
    render(<ThemeToggle theme="paper" onToggle={() => {}} />);
    expect(screen.getByRole('button', { name: /midnight/i })).toBeTruthy();
  });

  it('reports which atmosphere is active', () => {
    render(<ThemeToggle theme="midnight" onToggle={() => {}} />);
    expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('true');
  });

  it('calls back on click', () => {
    const onToggle = vi.fn();
    render(<ThemeToggle theme="paper" onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
