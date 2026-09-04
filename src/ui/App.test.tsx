import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { App } from './App';

beforeEach(() => localStorage.clear());

describe('App', () => {
  it('opens on the map', () => {
    const { container } = render(<App />);
    expect(container.querySelectorAll('polyline[data-line]')).toHaveLength(7);
  });

  it('starts a line run from the map', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /kl monorail/i }));
    fireEvent.keyDown(window, { key: '1' });
    expect(screen.getByLabelText('Type KL Sentral')).toBeTruthy();
  });

  it('starts an adventure from a searched station', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /start anywhere/i }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'imbi' } });
    fireEvent.click(screen.getByRole('button', { name: /^imbi/i }));
    expect(screen.getByLabelText('Type Imbi')).toBeTruthy();
  });
});
