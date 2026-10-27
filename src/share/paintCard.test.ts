import { describe, expect, it } from 'vitest';
import { loadNetworkData } from '../data/load';
import type { Metrics } from '../engine/metrics';
import { buildNetwork } from '../engine/network';
import { startRun, type RunState } from '../engine/run';
import { paintCard } from './paintCard';
import { lineRunCard } from './shareCard';

const net = buildNetwork(loadNetworkData());
const metrics: Metrics = { wpm: 64, accuracy: 0.97, score: 60.2 };

/**
 * jsdom has no canvas, so this records what would be drawn. Text is measured
 * at a fixed advance per character, enough to exercise the fitting.
 */
function recorder() {
  const texts: string[] = [];
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get(target, prop) {
      if (prop === 'fillText') return (text: string) => texts.push(text);
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
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts };
}

function run(): RunState {
  const ids = net.lines.get('KJ')!.stations;
  return { ...startRun(net, ids[0]!, 0), line: 'KJ', stationTimes: ids.map((id) => ({ id, ms: 2_000 })) };
}

describe('paintCard', () => {
  it('draws the brand, the result, its stamps and the address', () => {
    const { ctx, texts } = recorder();
    paintCard(ctx, lineRunCard(net, run(), { metrics, verified: true, overallRank: 4 }));
    expect(texts).toEqual(expect.arrayContaining([
      'KL-METRO TYPING', 'LINE RUN', 'Gombak → Putra Heights', 'KJ',
      '64', '97%', 'WPM', 'ACCURACY', 'Verified', '#4 overall', 'kl-metro-typing.vercel.app',
    ]));
  });

  it('cuts a title too long for the card with an ellipsis', () => {
    const { ctx, texts } = recorder();
    const card = { ...lineRunCard(net, run(), { metrics, verified: false }), title: 'Very long '.repeat(20) };
    paintCard(ctx, card);
    const title = texts.find((t) => t.startsWith('Very long'))!;
    expect(title.endsWith('…')).toBe(true);
    expect(title.length).toBeLessThan(card.title.length);
  });
});
