import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { startRun } from '../engine/run';
import { lineRunCard } from '../share/shareCard';
import { ShareButton } from './ShareButton';

const render$ = vi.hoisted(() => ({ png: vi.fn<[], Promise<Blob | null>>() }));
vi.mock('../share/shareResult', async (importActual) => ({
  ...(await importActual<typeof import('../share/shareResult')>()),
  renderCardPng: () => render$.png(),
}));

const net = buildNetwork(loadNetworkData());
const ids = net.lines.get('MR')!.stations;
const card = lineRunCard(
  net,
  { ...startRun(net, ids[0]!, 0), line: 'MR', stationTimes: ids.map((id) => ({ id, ms: 1_000 })) },
  { metrics: { wpm: 50, accuracy: 0.95, score: 45 }, verified: true },
);

const nav = navigator as unknown as Record<string, unknown>;
const added = ['share', 'canShare', 'clipboard'] as const;

beforeEach(() => {
  render$.png.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
});

afterEach(() => {
  for (const key of added) delete nav[key];
  vi.unstubAllGlobals();
});

describe('ShareButton', () => {
  it('waits for the image, then offers to save it', async () => {
    render(<ShareButton card={card} />);
    expect((screen.getByRole('button', { name: 'Preparing image…' }) as HTMLButtonElement).disabled).toBe(true);
    expect((await screen.findByRole('button', { name: 'Save image' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole('button', { name: 'Share result' })).toBeNull();
  });

  it('shows nothing where the card cannot be drawn', async () => {
    render$.png.mockResolvedValue(null);
    const { container } = render(<ShareButton card={card} />);
    await waitFor(() => expect(container.innerHTML).toBe(''));
  });

  it('opens the share sheet with the image and the address', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.assign(nav, { share, canShare: () => true });
    render(<ShareButton card={card} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Share result' }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const data = share.mock.calls[0]![0] as ShareData;
    expect(data.files?.[0]?.name).toBe('kl-metro-mr-run.png');
    expect(data.text).toContain('https://kl-metro-typing.vercel.app/');
  });

  it('says nothing when the player dismisses the share sheet', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'));
    Object.assign(nav, { share, canShare: () => true });
    render(<ShareButton card={card} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Share result' }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('copies the image where there is no share sheet', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    Object.assign(nav, { clipboard: { write } });
    vi.stubGlobal('ClipboardItem', class { constructor(public items: Record<string, Blob>) {} });
    render(<ShareButton card={card} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Copy image' }));
    await screen.findByText('Image copied.');
    expect(write).toHaveBeenCalledTimes(1);
  });
});
