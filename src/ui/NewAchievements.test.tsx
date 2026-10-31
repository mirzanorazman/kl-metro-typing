import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import type { EarnedTier } from '../engine/achievementState';
import { sound } from '../audio/sound';
import { NewAchievements } from './NewAchievements';

const net = buildNetwork(loadNetworkData());

const FIVE: EarnedTier[] = [
  { id: 'explorer.unlocked', award: 'silver', at: 1 },
  { id: 'line.completed', award: 'bronze', at: 1 },
  { id: 'secret.nightOwl', award: 'secret', at: 1 },
  { id: 'quick.score', award: 'gold', at: 1 },
  { id: 'craft.days', award: 'bronze', at: 1 },
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NewAchievements', () => {
  it('shows the rows it is given and counts the ones still waiting', () => {
    vi.spyOn(sound, 'achievement').mockImplementation(() => {});
    render(<NewAchievements net={net} items={FIVE.slice(0, 3)} more={2} />);

    const section = screen.getByRole('region', { name: 'New achievements' });
    const rows = within(section).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]!.textContent).toContain('Jalan-Jalan');
    expect(rows[0]!.textContent).toContain('Silver · 75 stations');
    expect(rows[2]!.textContent).toContain('Secret');
    expect(within(section).getByText('+2 more')).toBeTruthy();
    expect(within(section).queryByRole('button', { name: '+2 more' })).toBeNull();
  });

  it('opens the rest from "+n more" when given somewhere to go', () => {
    vi.spyOn(sound, 'achievement').mockImplementation(() => {});
    const onMore = vi.fn();
    render(<NewAchievements net={net} items={FIVE.slice(0, 3)} more={2} onMore={onMore} />);

    screen.getByRole('button', { name: '+2 more' }).click();

    expect(onMore).toHaveBeenCalledTimes(1);
  });

  it('shows no "+n more" when nothing else is waiting', () => {
    vi.spyOn(sound, 'achievement').mockImplementation(() => {});
    render(<NewAchievements net={net} items={FIVE.slice(0, 3)} />);

    expect(screen.queryByText(/more$/)).toBeNull();
  });

  it('renders nothing with no items', () => {
    const achievement = vi.spyOn(sound, 'achievement').mockImplementation(() => {});
    const { container } = render(<NewAchievements net={net} items={[]} />);

    expect(container.innerHTML).toBe('');
    expect(achievement).not.toHaveBeenCalled();
  });

  it('plays the cue once', () => {
    const achievement = vi.spyOn(sound, 'achievement').mockImplementation(() => {});
    const { rerender } = render(<StrictMode><NewAchievements net={net} items={[]} /></StrictMode>);
    rerender(<StrictMode><NewAchievements net={net} items={FIVE.slice(0, 1)} /></StrictMode>);
    rerender(<StrictMode><NewAchievements net={net} items={FIVE} /></StrictMode>);

    expect(achievement).toHaveBeenCalledTimes(1);
  });
});
