import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { ACHIEVEMENTS } from '../engine/achievementDefs';
import { emptyAchievements, type AchievementState, type Award } from '../engine/achievementState';
import { buildNetwork } from '../engine/network';
import { emptyProfile, loadProfile, saveProfile } from '../engine/progress';
import { localDay } from '../engine/achievements';
import { AchievementsScreen } from './AchievementsScreen';

vi.mock('../share/shareResult', async (importActual) => ({
  ...(await importActual<typeof import('../share/shareResult')>()),
  renderBadgePng: async () => new Blob(['badge'], { type: 'image/png' }),
}));

const net = buildNetwork(loadNetworkData());
const stationIds = [...net.stations.keys()];
const SECRET_NAMES = ACHIEVEMENTS.filter((a) => a.category === 'secret').map((a) => a.name);
const SECRET_DESCRIPTIONS = ACHIEVEMENTS.filter((a) => a.category === 'secret').map((a) => a.description);
const describedAs = (id: string) => ACHIEVEMENTS.find((a) => a.id === id)!.description;

function earn(
  state: AchievementState, id: string, award: Award, at: Partial<Record<Award, number>> = { [award]: 1 },
): AchievementState {
  return { ...state, earned: { ...state.earned, [id]: { award, at } } };
}

function seed(achievements: AchievementState, visited: number = 0) {
  saveProfile({ ...emptyProfile(), visited: stationIds.slice(0, visited), achievements });
}

function installMatchMedia(phone: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: phone,
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const row = (name: string) => screen.getByRole('button', { name: new RegExp(name) });

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).matchMedia;
});

describe('AchievementsScreen', () => {
  it('lists 47 achievements in six sections', () => {
    const { container } = render(<AchievementsScreen net={net} onExit={() => {}} />);

    expect(container.querySelectorAll('li.achievement-row')).toHaveLength(47);
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Explorer', 'Line Run', 'Quick Run', 'Dispatcher', 'Typing craft', 'Secrets',
    ]);
  });

  it('shows the overall count', () => {
    let state = earn(emptyAchievements(), 'explorer.unlocked', 'bronze');
    state = earn(state, 'secret.nightOwl', 'secret');
    seed(state, 30);
    render(<AchievementsScreen net={net} onExit={() => {}} />);

    expect(screen.getByText('2 of 47')).toBeTruthy();
    expect(screen.getByText('1 of 11 found')).toBeTruthy();
  });

  it('shows a locked row with what Bronze needs', () => {
    render(<AchievementsScreen net={net} onExit={() => {}} />);

    expect(row('Jalan-Jalan').textContent).toContain('Locked · 25 stations for Bronze');
    // A fraction reads through its label, not as "0.97 more".
    expect(row('Spotless').textContent).toContain('Locked · 97% accuracy for Bronze');
  });

  it('shows progress to the next tier', () => {
    seed(earn(emptyAchievements(), 'explorer.unlocked', 'bronze'), 30);
    render(<AchievementsScreen net={net} onExit={() => {}} />);

    expect(row('Jalan-Jalan').textContent).toContain('Bronze · 25 stations');
    expect(row('Jalan-Jalan').textContent).toContain('45 more to Silver');
  });

  it('names a fractional next tier by its label', () => {
    const state = earn(emptyAchievements(), 'line.accuracy', 'bronze');
    seed({ ...state, bests: { ...state.bests, lineAccuracy: 0.98 } });
    render(<AchievementsScreen net={net} onExit={() => {}} />);

    expect(row('Spotless').textContent).toContain('Bronze · 97% accuracy');
    expect(row('Spotless').textContent).toContain('99% accuracy for Silver');
  });

  it('names Gold by its label when the achievement is a fraction', () => {
    const state = earn(emptyAchievements(), 'line.accuracy', 'silver');
    seed({ ...state, bests: { ...state.bests, lineAccuracy: 0.995 } });
    render(<AchievementsScreen net={net} onExit={() => {}} />);

    expect(row('Spotless').textContent).toContain('100% accuracy for Gold');
    expect(row('Spotless').textContent).not.toContain('more to Gold');
  });

  it('gives a Gold row no progress line', () => {
    seed(earn(emptyAchievements(), 'explorer.unlocked', 'gold'), stationIds.length);
    render(<AchievementsScreen net={net} onExit={() => {}} />);

    const text = row('Jalan-Jalan').textContent!;
    expect(text).toContain(`Gold · all ${stationIds.length} stations`);
    expect(text).not.toContain('more to');
  });

  it('hides an unearned secret', () => {
    const { container, unmount } = render(<AchievementsScreen net={net} onExit={() => {}} />);

    for (const name of SECRET_NAMES) expect(container.textContent).not.toContain(name);
    for (const text of SECRET_DESCRIPTIONS) expect(container.innerHTML).not.toContain(text);
    expect(container.innerHTML).not.toContain('Night Owl');
    expect(screen.getAllByText('Secret')).toHaveLength(11);
    unmount();

    seed(earn(emptyAchievements(), 'secret.nightOwl', 'secret'));
    render(<AchievementsScreen net={net} onExit={() => {}} />);
    expect(screen.getByText('Night Owl')).toBeTruthy();
    expect(screen.queryByText('Merdeka!')).toBeNull();
  });

  it('notes Dispatcher on a phone', () => {
    installMatchMedia(true);
    const { unmount } = render(<AchievementsScreen net={net} embedded />);
    expect(screen.getByText('Dispatcher is played on a larger screen.')).toBeTruthy();
    unmount();

    installMatchMedia(false);
    render(<AchievementsScreen net={net} onExit={() => {}} />);
    expect(screen.queryByText('Dispatcher is played on a larger screen.')).toBeNull();
  });

  it('marks claimed achievements as new and clears them', () => {
    const state = earn(emptyAchievements(), 'explorer.unlocked', 'bronze');
    seed({ ...state, unannounced: [{ id: 'explorer.unlocked', award: 'bronze', at: 1 }] }, 30);

    const { unmount } = render(<StrictMode><AchievementsScreen net={net} onExit={() => {}} /></StrictMode>);
    expect(within(row('Jalan-Jalan')).getByText('New')).toBeTruthy();
    expect(screen.getAllByText('New')).toHaveLength(1);
    expect(loadProfile().achievements!.unannounced).toEqual([]);
    unmount();

    render(<AchievementsScreen net={net} onExit={() => {}} />);
    expect(screen.queryByText('New')).toBeNull();
  });

  it('shows the backfill note once', () => {
    let state = earn(emptyAchievements(), 'explorer.unlocked', 'bronze');
    state = earn(state, 'quick.score', 'bronze');
    seed({ ...state, backfilled: ['explorer.unlocked', 'quick.score'] }, 30);

    const { unmount } = render(<StrictMode><AchievementsScreen net={net} onExit={() => {}} /></StrictMode>);
    expect(screen.getByText('We found 2 achievements from your earlier travels')).toBeTruthy();
    expect(loadProfile().achievements!.backfilled).toBeNull();
    unmount();

    render(<AchievementsScreen net={net} onExit={() => {}} />);
    expect(screen.queryByText(/earlier travels/)).toBeNull();
  });

  it('says "achievement" for a single backfilled one', () => {
    seed({ ...earn(emptyAchievements(), 'explorer.unlocked', 'bronze'), backfilled: ['explorer.unlocked'] }, 30);
    render(<AchievementsScreen net={net} onExit={() => {}} />);

    expect(screen.getByText('We found 1 achievement from your earlier travels')).toBeTruthy();
  });

  it('leaves an empty backfill list alone', () => {
    seed({ ...emptyAchievements(), backfilled: [] });
    render(<AchievementsScreen net={net} onExit={() => {}} />);

    expect(screen.queryByText(/earlier travels/)).toBeNull();
  });

  it('reads an Era and All-Rounder progress as the next tier, not a count', () => {
    let state = earn(emptyAchievements(), 'dispatch.era', 'bronze');
    state = earn(state, 'craft.allRounder', 'bronze');
    for (const id of ['explorer.unlocked', 'line.completed', 'quick.score', 'dispatch.delivered']) {
      state = earn(state, id, 'bronze');
    }
    seed({ ...state, bests: { ...state.bests, era: 1 } }, 30);
    render(<AchievementsScreen net={net} onExit={() => {}} />);

    expect(row('Through the Eras').textContent).toContain('2015–17 for Silver');
    expect(row('Through the Eras').textContent).not.toContain('more to');
    expect(row('All-Rounder').textContent).toContain('all Silver for Silver');
    expect(row('All-Rounder').textContent).not.toContain('more to');
  });

  it("counts Day Pass from today's Lines only", () => {
    const yesterday = earn(emptyAchievements(), 'line.dayPass', 'bronze');
    seed({ ...yesterday, dayPass: { day: '2020-01-01', lines: ['KJ', 'AG', 'SP'] } });
    const { unmount } = render(<AchievementsScreen net={net} onExit={() => {}} />);
    expect(row('Day Pass').textContent).toContain('4 more to Silver');
    unmount();

    seed({ ...yesterday, dayPass: { day: localDay(Date.now()), lines: ['KJ', 'AG', 'SP'] } });
    render(<AchievementsScreen net={net} onExit={() => {}} />);
    expect(row('Day Pass').textContent).toContain('1 more to Silver');
  });

  it('names the detail it controls only while it is open', () => {
    seed(earn(emptyAchievements(), 'explorer.unlocked', 'bronze'), 30);
    render(<AchievementsScreen net={net} onExit={() => {}} />);

    const button = row('Jalan-Jalan');
    expect(button.hasAttribute('aria-controls')).toBe(false);
    fireEvent.click(button);
    expect(document.getElementById(button.getAttribute('aria-controls')!)).not.toBeNull();
    fireEvent.click(button);
    expect(button.hasAttribute('aria-controls')).toBe(false);
  });

  it("opens a row's detail with all three thresholds", () => {
    const at = new Date(2026, 2, 5).getTime();
    seed(earn(emptyAchievements(), 'explorer.unlocked', 'silver', { bronze: at, silver: at }), 80);
    render(<AchievementsScreen net={net} onExit={() => {}} />);

    const button = row('Jalan-Jalan');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');

    const detail = document.getElementById(button.getAttribute('aria-controls')!)!;
    expect(detail.firstElementChild!.textContent).toBe(describedAs('explorer.unlocked'));
    const items = within(detail).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]!.textContent).toContain('Bronze');
    expect(items[0]!.textContent).toContain('25 stations');
    expect(items[0]!.textContent).toContain(`Earned ${new Date(at).toLocaleDateString()}`);
    expect(items[1]!.textContent).toContain('75 stations');
    expect(items[2]!.textContent).toContain(`all ${stationIds.length} stations`);
    expect(items[2]!.textContent).toContain('Not yet');

    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('dates an earned secret in its detail', () => {
    const at = new Date(2026, 9, 31).getTime();
    seed(earn(emptyAchievements(), 'secret.nightOwl', 'secret', { secret: at }));
    render(<AchievementsScreen net={net} onExit={() => {}} />);

    expect(screen.queryByText(describedAs('secret.nightOwl'))).toBeNull();
    fireEvent.click(row('Night Owl'));
    expect(screen.getByText(describedAs('secret.nightOwl'))).toBeTruthy();
    expect(screen.getByText(`Earned ${new Date(at).toLocaleDateString()}`)).toBeTruthy();
  });

  it('returns home on Escape and offers a way back', () => {
    const onExit = vi.fn();
    render(<AchievementsScreen net={net} onExit={onExit} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onExit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /back to the map/i }));
    expect(onExit).toHaveBeenCalledTimes(2);
  });

  it('has no Back or Escape when embedded', () => {
    const onExit = vi.fn();
    render(<AchievementsScreen net={net} onExit={onExit} embedded />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onExit).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /back to the map/i })).toBeNull();
  });
});

describe('Share badge', () => {
  const drawn = () => act(async () => {});

  beforeEach(() => {
    vi.stubGlobal('URL', Object.assign(Object.create(URL), {
      createObjectURL: vi.fn(() => 'blob:card'),
      revokeObjectURL: vi.fn(),
    }));
  });

  afterEach(() => {
    // Unmount first: a preview revokes its object URL as it goes.
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shares an earned badge at its highest tier', async () => {
    seed(earn(emptyAchievements(), 'line.accuracy', 'silver', { bronze: 1, silver: 2 }));
    render(<AchievementsScreen net={net} onExit={() => {}} />);
    fireEvent.click(row('Spotless'));
    fireEvent.click(screen.getByRole('button', { name: 'Share badge' }));
    const dialog = screen.getByRole('dialog', { name: 'Share' });
    expect(await within(dialog).findByRole('img', { name: 'Achievement card: Spotless, Silver' })).toBeTruthy();
    await drawn();
  });

  it('offers nothing to share before it is earned', () => {
    render(<AchievementsScreen net={net} onExit={() => {}} />);
    fireEvent.click(row('Spotless'));
    expect(screen.queryByRole('button', { name: 'Share badge' })).toBeNull();
  });

  it('never offers an unearned Secret', () => {
    seed(earn(emptyAchievements(), 'line.accuracy', 'gold'));
    render(<AchievementsScreen net={net} onExit={() => {}} />);
    const offered: string[] = [];
    for (const face of screen.getAllByRole('button', { expanded: false })) {
      fireEvent.click(face);
      if (screen.queryByRole('button', { name: 'Share badge' })) offered.push(face.textContent ?? '');
    }
    expect(offered).toHaveLength(1);
    expect(offered[0]).toContain('Spotless');
  });

  it('shares an earned Secret', async () => {
    seed(earn(emptyAchievements(), 'secret.ampang', 'secret'));
    render(<AchievementsScreen net={net} onExit={() => {}} />);
    fireEvent.click(row('Not That Ampang'));
    fireEvent.click(screen.getByRole('button', { name: 'Share badge' }));
    expect(await screen.findByRole('img', { name: 'Achievement card: Not That Ampang, Secret' })).toBeTruthy();
    await drawn();
  });

  it('lets Esc close the sheet before it leaves the screen', async () => {
    const onExit = vi.fn();
    seed(earn(emptyAchievements(), 'line.accuracy', 'gold'));
    render(<AchievementsScreen net={net} onExit={onExit} />);
    fireEvent.click(row('Spotless'));
    const share = screen.getByRole('button', { name: 'Share badge' });
    share.focus();
    fireEvent.click(share);
    await drawn();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onExit).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Share badge' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('closes only the sheet on Esc even when focus has left it', async () => {
    const onExit = vi.fn();
    seed(earn(emptyAchievements(), 'line.accuracy', 'gold'));
    render(<AchievementsScreen net={net} onExit={onExit} />);
    fireEvent.click(row('Spotless'));
    fireEvent.click(screen.getByRole('button', { name: 'Share badge' }));
    await drawn();
    // Safari does not focus a clicked button, so a click inside the sheet can leave focus on the body.
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onExit).not.toHaveBeenCalled();
  });
});
