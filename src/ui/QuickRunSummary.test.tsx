import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Metrics } from '../engine/metrics';
import { QuickRunSummary } from './QuickRunSummary';

const metrics: Metrics = { wpm: 51.2, accuracy: 0.968, score: 48 };

function renderSummary(overrides: Partial<React.ComponentProps<typeof QuickRunSummary>> = {}) {
  return render(
    <QuickRunSummary
      lineName="Kelana Jaya Line"
      status="completed"
      stations={6}
      metrics={metrics}
      personalBest={null}
      newBest={false}
      onAgain={() => {}}
      onBack={() => {}}
      {...overrides}
    />,
  );
}

function expectStat(label: string, value: string) {
  const term = screen.getByText(label, { selector: 'dt' });
  expect(term.nextElementSibling?.tagName).toBe('DD');
  expect(term.nextElementSibling?.textContent).toBe(value);
}

describe('QuickRunSummary', () => {
  it('renders a completed new-best result with exact rounded metrics and actions', () => {
    const { container } = renderSummary({ newBest: true });

    expect(container.querySelector('section.quick-summary')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Quick Run complete' })).toBeTruthy();
    expect(screen.getByText('Kelana Jaya Line · 45 seconds')).toBeTruthy();
    expect(container.querySelector('dl')).toBeTruthy();
    expectStat('Stations completed', '6');
    expectStat('WPM', '51');
    expectStat('Accuracy', '96.8%');
    expectStat('Score', '48');
    expect(screen.getByRole('status').textContent).toBe('New personal best');
    expect(screen.getByRole('button', { name: 'Run again' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to Transit' })).toBeTruthy();
  });

  it('renders a rounded personal best for a completed non-best result', () => {
    renderSummary({ personalBest: 47.6, newBest: false });

    expect(screen.getByRole('status').textContent).toBe('Personal best: 48');
  });

  it('omits the best line when a completed result has no personal best', () => {
    renderSummary({ personalBest: null, newBest: false });

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText(/personal best/i)).toBeNull();
  });

  it('explains interrupted results and suppresses every personal-best message', () => {
    renderSummary({ status: 'interrupted', personalBest: 99, newBest: true });

    expect(screen.getByRole('heading', { name: 'Run interrupted' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe(
      'This result was not saved as a personal best.',
    );
    expect(screen.queryByText('New personal best')).toBeNull();
    expect(screen.queryByText('Personal best: 99')).toBeNull();
  });

  it('invokes both action callbacks exactly once', () => {
    const onAgain = vi.fn();
    const onBack = vi.fn();
    renderSummary({ onAgain, onBack });

    fireEvent.click(screen.getByRole('button', { name: 'Run again' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to Transit' }));

    expect(onAgain).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('contains no journey, leaderboard, split, table, or SVG detail', () => {
    const { container } = renderSummary();

    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('table')).toBeNull();
    expect(container.querySelector('.summary-journey')).toBeNull();
    expect(container.querySelector('.leaderboard-panel')).toBeNull();
    expect(container.textContent).not.toMatch(/fastest|slowest|split/i);
  });

  it('keeps the Stations completed label unchanged for zero and singular values', () => {
    const { rerender } = renderSummary({ stations: 0 });

    expectStat('Stations completed', '0');

    rerender(
      <QuickRunSummary
        lineName="Kelana Jaya Line"
        status="completed"
        stations={1}
        metrics={metrics}
        personalBest={null}
        newBest={false}
        onAgain={() => {}}
        onBack={() => {}}
      />,
    );

    expectStat('Stations completed', '1');
  });
});
