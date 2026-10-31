import { describe, expect, it } from 'vitest';
import { loadNetworkData } from '../data/load';
import { emptyAchievements } from '../engine/achievementState';
import { buildNetwork } from '../engine/network';
import { badgeCard, shareableBadge } from './badgeCard';

const net = buildNetwork(loadNetworkData());

describe('badgeCard', () => {
  it('names a tiered badge, its tier, and what to send with it', () => {
    const card = badgeCard(net, { id: 'explorer.unlocked', award: 'gold' });
    expect(card).toMatchObject({
      id: 'explorer.unlocked',
      award: 'gold',
      name: 'Jalan-Jalan',
      text: 'I earned Jalan-Jalan (Gold) in KL-Metro Typing.',
      fileName: 'kl-metro-typing-jalan-jalan-gold.png',
      alt: 'Achievement card: Jalan-Jalan, Gold',
    });
    expect(card.tier.startsWith('Gold · ')).toBe(true);
  });

  it('keeps an earned Secret to its name', () => {
    expect(badgeCard(net, { id: 'secret.ampang', award: 'secret' })).toMatchObject({
      name: 'Not That Ampang',
      tier: 'Secret',
      text: 'I found a secret in KL-Metro Typing: Not That Ampang.',
      fileName: 'kl-metro-typing-not-that-ampang-secret.png',
      alt: 'Achievement card: Not That Ampang, Secret',
    });
  });

  it('refuses an unknown achievement or an award of the wrong kind', () => {
    expect(() => badgeCard(net, { id: 'nope', award: 'gold' })).toThrow();
    expect(() => badgeCard(net, { id: 'secret.ampang', award: 'gold' })).toThrow();
    expect(() => badgeCard(net, { id: 'explorer.unlocked', award: 'secret' })).toThrow();
  });
});

describe('shareableBadge', () => {
  it('offers nothing not yet earned, Secrets included', () => {
    expect(shareableBadge(emptyAchievements(), 'secret.ampang')).toBeNull();
    expect(shareableBadge(emptyAchievements(), 'explorer.unlocked')).toBeNull();
  });

  it('offers the highest tier earned', () => {
    const state = emptyAchievements();
    state.earned['explorer.unlocked'] = { award: 'silver', at: { bronze: 1, silver: 2 } };
    expect(shareableBadge(state, 'explorer.unlocked')).toEqual({ id: 'explorer.unlocked', award: 'silver' });
  });

  it('offers nothing a stored state names that this version cannot draw', () => {
    const state = emptyAchievements();
    state.earned['gone.away'] = { award: 'gold', at: { gold: 1 } };
    state.earned['secret.ampang'] = { award: 'gold', at: { gold: 1 } };
    expect(shareableBadge(state, 'gone.away')).toBeNull();
    expect(shareableBadge(state, 'secret.ampang')).toBeNull();
  });
});
