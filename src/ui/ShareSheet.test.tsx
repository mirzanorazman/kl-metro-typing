import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { startRun } from '../engine/run';
import { lineRunCard } from '../share/shareCard';
import { ShareSheet, type ShareChoice } from './ShareSheet';

const render$ = vi.hoisted(() => ({ badge: vi.fn<[unknown, { id: string }], Promise<Blob | null>>() }));
vi.mock('../share/shareResult', async (importActual) => ({
  ...(await importActual<typeof import('../share/shareResult')>()),
  renderBadgePng: (net: unknown, card: { id: string }) => render$.badge(net, card),
}));

const net = buildNetwork(loadNetworkData());
const ids = net.lines.get('MR')!.stations;
const card = lineRunCard(
  net,
  { ...startRun(net, ids[0]!, 0), line: 'MR', stationTimes: ids.map((id) => ({ id, ms: 1_000, errors: 0 })) },
  { metrics: { wpm: 50, accuracy: 0.95, score: 45 }, verified: true },
);
const png = () => new Blob(['png'], { type: 'image/png' });
const run: ShareChoice = { kind: 'run', card, image: { status: 'ready', blob: png(), file: new File([png()], card.fileName) } };
const jalan: ShareChoice = { kind: 'badge', item: { id: 'explorer.unlocked', award: 'gold' } };
const express: ShareChoice = { kind: 'badge', item: { id: 'quick.score', award: 'bronze' } };

beforeEach(() => {
  render$.badge.mockImplementation(async () => png());
  vi.stubGlobal('URL', Object.assign(Object.create(URL), {
    createObjectURL: vi.fn(() => 'blob:card'),
    revokeObjectURL: vi.fn(),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Lets every choice finish drawing, so no update lands after a test ends. */
const drawn = () => act(async () => {});

/** The panel on show: the one not hidden. */
function shown() {
  return screen.getAllByTestId('share-sheet-panel').find((p) => !p.hidden)!;
}

describe('ShareSheet', () => {
  it('asks what to share, starting with the run', async () => {
    render(<ShareSheet net={net} choices={[run, jalan, express]} onClose={() => {}} />);
    await drawn();
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('aria-label') ?? r.closest('label')!.textContent)).toEqual([
      'This run', 'Jalan-Jalan', 'Express Service',
    ]);
    expect(screen.getByRole('radio', { name: 'This run' })).toHaveProperty('checked', true);
    const img = await within(shown()).findByRole('img');
    expect(img.getAttribute('alt')!.startsWith('Result card:')).toBe(true);
  });

  it('shows and saves the badge chosen', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    let saved = '';
    click.mockImplementation(function (this: HTMLAnchorElement) {
      saved = this.download;
    });
    render(<ShareSheet net={net} choices={[run, jalan, express]} onClose={() => {}} />);
    await drawn();
    fireEvent.click(screen.getByRole('radio', { name: 'Jalan-Jalan' }));
    expect((await within(shown()).findByRole('img')).getAttribute('alt')).toBe('Achievement card: Jalan-Jalan, Gold');
    fireEvent.click(within(shown()).getByRole('button', { name: 'Save image' }));
    expect(saved).toBe('kl-metro-typing-jalan-jalan-gold.png');
  });

  it('offers no choice when there is one thing to share', async () => {
    render(<ShareSheet net={net} choices={[jalan]} onClose={() => {}} />);
    await drawn();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect((await within(shown()).findByRole('img')).getAttribute('alt')).toBe('Achievement card: Jalan-Jalan, Gold');
  });

  it('says so when a badge cannot be drawn, and the run still shares', async () => {
    render$.badge.mockResolvedValue(null);
    render(<ShareSheet net={net} choices={[run, jalan]} onClose={() => {}} />);
    await drawn();
    expect(await within(shown()).findByRole('button', { name: 'Save image' })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Jalan-Jalan' }));
    expect(await within(shown()).findByText("This image couldn't be drawn.")).toBeTruthy();
    expect(within(shown()).queryByRole('button', { name: 'Save image' })).toBeNull();
  });

  it('closes on Esc without the page beneath hearing it', async () => {
    const onClose = vi.fn();
    const beneath = vi.fn();
    window.addEventListener('keydown', beneath);
    render(<ShareSheet net={net} choices={[run, jalan]} onClose={onClose} />);
    await drawn();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    window.removeEventListener('keydown', beneath);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(beneath).not.toHaveBeenCalled();
  });

  it('closes from its Close button', async () => {
    const onClose = vi.fn();
    render(<ShareSheet net={net} choices={[jalan]} onClose={onClose} />);
    await drawn();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('is a modal dialog named Share', async () => {
    render(<ShareSheet net={net} choices={[jalan]} onClose={() => {}} />);
    await drawn();
    const dialog = screen.getByRole('dialog', { name: 'Share' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('gives focus back to what opened it', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const { unmount } = render(<ShareSheet net={net} choices={[run, jalan]} onClose={() => {}} />);
    await drawn();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'This run' })));
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
