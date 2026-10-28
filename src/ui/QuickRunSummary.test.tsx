import { readFileSync } from 'node:fs';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Metrics } from '../engine/metrics';
import type { ShareCard } from '../share/shareCard';
import { QuickRunSummary } from './QuickRunSummary';

const render$ = vi.hoisted(() => ({ png: vi.fn<[], Promise<Blob | null>>() }));
vi.mock('../share/shareResult', async (importActual) => ({
  ...(await importActual<typeof import('../share/shareResult')>()),
  renderCardPng: () => render$.png(),
}));

const card: ShareCard = {
  mode: 'QUICK RUN',
  title: '18 stations in 30 s',
  subtitle: 'KL Monorail → Kelana Jaya',
  lines: [],
  stats: [
    { label: 'WPM', value: '70' },
    { label: 'Accuracy', value: '92%' },
    { label: 'Score', value: '60' },
    { label: 'Stations', value: '18' },
  ],
  badges: ['Verified'],
  map: { view: { x: 0, y: 0, w: 1, h: 1 }, network: [], route: [], start: null, end: null } as unknown as ShareCard['map'],
  text: 'I typed 18 stations',
  fileName: 'kl-metro-quick-run.png',
};

beforeEach(() => {
  render$.png.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
  vi.stubGlobal('URL', Object.assign(Object.create(URL), {
    createObjectURL: vi.fn(() => 'blob:card'),
    revokeObjectURL: vi.fn(),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const metrics: Metrics = { wpm: 51.2, accuracy: 0.968, score: 48 };
const mobileStyles = readFileSync('src/ui/mobile.css', 'utf8');
const summarySource = readFileSync('src/ui/QuickRunSummary.tsx', 'utf8');

function renderSummary(overrides: Partial<React.ComponentProps<typeof QuickRunSummary>> = {}) {
  return render(
    <QuickRunSummary
      lines={['MR', 'SP', 'KJ']}
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
  it('shows the result card in place of the stats once it is drawn', async () => {
    renderSummary({ share: card });
    const image = await screen.findByRole('img', { name: /18 stations in 30 s/ });
    expect(image.getAttribute('src')).toBe('blob:card');
    expect(image.getAttribute('alt')).toBe(
      'Result card: 18 stations in 30 s. KL Monorail → Kelana Jaya. WPM 70, Accuracy 92%, Score 60, Stations 18.',
    );
    expect(screen.queryByText('WPM', { selector: 'dt' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Save image' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Run again' })).toBeTruthy();
  });

  it('keeps the stats where the card cannot be drawn', async () => {
    render$.png.mockResolvedValue(null);
    renderSummary({ share: card });
    await waitFor(() => expectStat('WPM', '51'));
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('keeps the stats for an interrupted Run, which has no card', () => {
    renderSummary({ status: 'interrupted', share: null });
    expectStat('WPM', '51');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('blocks Run again in phone landscape while keeping Back available', () => {
    const onAgain = vi.fn();
    const onBack = vi.fn();
    renderSummary({ phoneLandscape: true, onAgain, onBack });

    expect(screen.getByRole('status').textContent).toBe('Rotate to portrait to play');
    const again = screen.getByRole('button', { name: 'Run again' }) as HTMLButtonElement;
    expect(again.disabled).toBe(true);
    fireEvent.click(again);
    fireEvent.click(screen.getByRole('button', { name: 'Back to Transit' }));
    expect(onAgain).not.toHaveBeenCalled();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('derives its displayed duration from the shared Quick Run constant', () => {
    expect(summarySource).toMatch(
      /import\s*\{\s*QUICK_RUN_MS\s*\}\s*from\s*'\.\.\/engine\/quickRun'/,
    );
    expect(summarySource).toContain('${QUICK_RUN_MS / 1000} seconds');
  });

  it('compacts into one non-scrolling viewport on short coarse-pointer screens', () => {
    expect(mobileStyles).toMatch(
      /\.quick-summary\s*\{[^}]*gap:\s*var\(--s2\);[^}]*overflow:\s*hidden;/,
    );
    expect(mobileStyles).toMatch(
      /@media\s*\(pointer:\s*coarse\)\s*and\s*\(max-height:\s*500px\)\s*\{\s*\.quick-summary\s*\{\s*gap:\s*var\(--s\);\s*padding:\s*var\(--s\);\s*\}\s*\.quick-summary dl\s*\{\s*gap:\s*2px var\(--s2\);\s*\}\s*\.quick-summary dd\s*\{\s*font-size:\s*var\(--t-md\);\s*\}\s*\.quick-summary-actions\s*\{\s*grid-template-columns:\s*1fr 1fr;\s*\}\s*\.quick-summary-actions button\s*\{\s*min-height:\s*44px;\s*\}\s*\}/,
    );

    const quickSummaryRules = [...mobileStyles.matchAll(/\.quick-summary[^{]*\{([^}]*)\}/g)]
      .map((match) => match[1])
      .join('\n');
    expect(quickSummaryRules).not.toMatch(/overflow(?:-[xy])?:\s*auto/);
  });

  it('renders a completed new-best result with exact rounded metrics and actions', () => {
    const { container } = renderSummary({ newBest: true });

    expect(container.querySelector('section.quick-summary')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Quick Run complete' })).toBeTruthy();
    expect(screen.getByText('30 seconds')).toBeTruthy();
    expectStat('Lines used', 'MR → SP → KJ');
    expect(screen.queryByText(/Kelana Jaya Line/)).toBeNull();
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

  it('retains repeated Lines in leg order', () => {
    renderSummary({ lines: ['MR', 'SP', 'MR'] });

    expectStat('Lines used', 'MR → SP → MR');
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
        lines={['KJ']}
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
