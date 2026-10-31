import { describe, expect, it } from 'vitest';
import { loadNetworkData } from '../data/load';
import { ACHIEVEMENTS } from '../engine/achievementDefs';
import { buildNetwork } from '../engine/network';
import { badgeCard } from './badgeCard';
import { BADGE_SIZE, paintBadgeCard } from './paintBadgeCard';

const net = buildNetwork(loadNetworkData());

/** As in paintCard.test.ts: records text and images, measuring text at a fixed advance. */
function recorder() {
  const texts: string[] = [];
  const images: unknown[][] = [];
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get(target, prop) {
      if (prop === 'fillText') return (text: string) => texts.push(text);
      if (prop === 'drawImage') return (...args: unknown[]) => images.push(args);
      if (prop === 'measureText') {
        return (text: string) => ({ width: text.length * Number(/(\d+)px/.exec(String(target.font))?.[1] ?? 10) * 0.6 });
      }
      if (prop in target) return target[prop];
      return () => {};
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts, images };
}

const badge = { kind: 'badge image' } as unknown as CanvasImageSource;

describe('paintBadgeCard', () => {
  it('draws the badge, its name and tier, and what the game is', () => {
    const { ctx, texts } = recorder();
    const card = badgeCard(net, { id: 'explorer.unlocked', award: 'gold' });
    paintBadgeCard(ctx, card, badge, net);
    expect(texts).toEqual(expect.arrayContaining([
      'Jalan-Jalan',
      card.tier.toUpperCase(),
      'KL-METRO TYPING',
      'Type your way across the Klang Valley · kl-metro-typing.vercel.app',
    ]));
  });

  it('draws the badge at its full size', () => {
    const { ctx, images } = recorder();
    paintBadgeCard(ctx, badgeCard(net, { id: 'explorer.unlocked', award: 'gold' }), badge, net);
    expect(images).toHaveLength(1);
    expect(images[0]![0]).toBe(badge);
    expect(images[0]!.slice(3)).toEqual([BADGE_SIZE, BADGE_SIZE]);
  });

  it('cuts a name too long for the card with an ellipsis', () => {
    const { ctx, texts } = recorder();
    const card = { ...badgeCard(net, { id: 'explorer.unlocked', award: 'gold' }), name: 'Long name '.repeat(6) };
    paintBadgeCard(ctx, card, badge, net);
    const name = texts.find((t) => t.startsWith('Long name'))!;
    expect(name.endsWith('…')).toBe(true);
  });

  it('keeps a Secret to its name', () => {
    const { ctx, texts } = recorder();
    paintBadgeCard(ctx, badgeCard(net, { id: 'secret.ampang', award: 'secret' }), badge, net);
    expect(texts).toContain('SECRET');
    const description = ACHIEVEMENTS.find((a) => a.id === 'secret.ampang')!.description;
    expect(texts.join(' ')).not.toContain(description.slice(0, 20));
  });
});
