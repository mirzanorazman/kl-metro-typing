import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import type { EarnedTier } from '../engine/achievementState';
import { buildNetwork } from '../engine/network';
import { startRun } from '../engine/run';
import { lineRunCard } from '../share/shareCard';
import { SummaryShare } from './SummaryShare';

vi.mock('../share/shareResult', async (importActual) => ({
  ...(await importActual<typeof import('../share/shareResult')>()),
  renderCardPng: async () => new Blob(['run'], { type: 'image/png' }),
  renderBadgePng: async () => new Blob(['badge'], { type: 'image/png' }),
}));

const net = buildNetwork(loadNetworkData());
const ids = net.lines.get('MR')!.stations;
const card = lineRunCard(
  net,
  { ...startRun(net, ids[0]!, 0), line: 'MR', stationTimes: ids.map((id) => ({ id, ms: 1_000, errors: 0 })) },
  { metrics: { wpm: 50, accuracy: 0.95, score: 45 }, verified: true },
);
const items: EarnedTier[] = [{ id: 'explorer.unlocked', award: 'gold', at: 1 }];
const drawn = () => act(async () => {});

beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(Object.create(URL), {
    createObjectURL: vi.fn(() => 'blob:card'),
    revokeObjectURL: vi.fn(),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SummaryShare', () => {
  it('is the run share as before when nothing new was earned', async () => {
    render(<SummaryShare net={net} card={card} items={[]} />);
    expect(await screen.findByRole('button', { name: 'Save image' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Share…' })).toBeNull();
  });

  it('asks what to share once something new was earned', async () => {
    render(<SummaryShare net={net} card={card} items={items} />);
    await drawn();
    expect(screen.queryByRole('button', { name: 'Share result' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save image' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Share…' }));
    const dialog = screen.getByRole('dialog', { name: 'Share' });
    expect(within(dialog).getByRole('radio', { name: 'This run' })).toBeTruthy();
    expect(within(dialog).getByRole('radio', { name: 'Jalan-Jalan' })).toBeTruthy();
    await drawn();
  });

  it('keeps the run image on the Summary while asking', async () => {
    render(<SummaryShare net={net} card={card} items={items} showImage />);
    await drawn();
    expect(screen.getByRole('img', { name: /^Result card:/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Share…' })).toBeTruthy();
  });

  it('offers only the badges when the run has no card', async () => {
    render(<SummaryShare net={net} card={null} items={items} />);
    fireEvent.click(screen.getByRole('button', { name: 'Share…' }));
    const dialog = screen.getByRole('dialog', { name: 'Share' });
    expect(within(dialog).queryByRole('radio')).toBeNull();
    expect(await within(dialog).findByRole('img', { name: 'Achievement card: Jalan-Jalan, Gold' })).toBeTruthy();
    await drawn();
  });

  it('skips a new achievement this version cannot draw', async () => {
    const stale: EarnedTier[] = [{ id: 'gone.away', award: 'gold', at: 1 }, ...items];
    render(<SummaryShare net={net} card={card} items={stale} />);
    await drawn();
    fireEvent.click(screen.getByRole('button', { name: 'Share…' }));
    const dialog = screen.getByRole('dialog', { name: 'Share' });
    expect(within(dialog).getAllByRole('radio').map((r) => r.closest('label')!.textContent)).toEqual(['This run', 'Jalan-Jalan']);
    await drawn();
  });

  it('gives focus back to Share… on close', async () => {
    render(<SummaryShare net={net} card={card} items={items} />);
    await drawn();
    const open = screen.getByRole('button', { name: 'Share…' });
    open.focus();
    fireEvent.click(open);
    await drawn();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Share…' })));
  });
});
