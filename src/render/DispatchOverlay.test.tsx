import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { loadNetworkData } from '../data/load';
import { startCareer, type CareerState } from '../engine/dispatch';
import { type Train } from '../engine/dispatchSim';
import { visibleTargets } from '../engine/dispatchTargets';
import { buildNetwork } from '../engine/network';
import { networkLayout } from '../geo/networkLayout';
import type { CrowdingHintView, CrowdingRing } from './crowdingHint';
import { DispatchOverlay } from './DispatchOverlay';
import { CHAR_EM, overlayLayout, overlayObstacles, RING_CLEAR_R, RING_R, RING_STROKE, ringCountBox } from './dispatchLayout';
import { labelBox, labelTiers, mapLabels } from './mapMarks';

describe('the Dispatcher overlay crowding hint', () => {
  const net = buildNetwork(loadNetworkData());
  const { geo: layout } = networkLayout();
  const M = 1;

  function waiting(id: number, station: string): Train {
    return { id, line: 'KJ', dir: 1, at: net.lines.get('KJ')!.stations.indexOf(station), stage: 'signal', ms: 0,
      skipTo: null, load: {}, lastExchange: null };
  }
  /** Train 1, late and so with a skip chip as well, and Train 2, far from anywhere crowded. */
  function career(): CareerState {
    const c = startCareer(net, 1);
    c.sim.shiftMs = 600_000;
    c.sim.trains = [waiting(1, 'damai'), waiting(2, 'kerinchi')];
    c.sim.platforms['ampang-park']!.lastCall['KJ:1'] = 590_000;
    return c;
  }
  const klcc: CrowdingRing = { id: 'klcc', share: 0.5, leftMs: 9_500, waiting: 62, lost: false };

  function draw(c: CareerState, hint?: CrowdingHintView) {
    const targets = visibleTargets(net, c.sim);
    return render(
      <svg><DispatchOverlay net={net} layout={layout} markScale={M} career={c} targets={targets} aimed={[]}
        hint={hint} /></svg>,
    ).container;
  }

  it('a relieving Train’s Signal chip is marked, its skip chip is not', () => {
    const dom = draw(career(), { relieving: new Set([1]), rings: [] });
    expect(dom.querySelectorAll('[data-testid="dispatch-skip"]').length).toBeGreaterThan(0);
    expect(dom.querySelectorAll('[data-testid="dispatch-signal"]').length).toBe(2);
    expect(dom.querySelectorAll('[data-testid="dispatch-signal"][data-relieve="true"]').length).toBe(1);
    expect(dom.querySelector('[data-testid="dispatch-skip"][data-relieve]')).toBeNull();
  });

  it('no hint marks nothing', () => {
    const dom = draw(career());
    expect(dom.querySelector('[data-relieve]')).toBeNull();
    expect(dom.querySelector('[data-testid="crowding-ring"]')).toBeNull();
  });

  it('a ring shows the countdown and the count', () => {
    const dom = draw(career(), { relieving: new Set(), rings: [klcc] });
    const rings = dom.querySelectorAll('[data-testid="crowding-ring"][data-station="klcc"]');
    expect(rings.length).toBe(1);
    expect(rings[0]!.querySelector('.crowding-ring-arc')!.getAttribute('stroke-dasharray')).toMatch(/^0\.5 /);
    expect(rings[0]!.textContent).toContain('62');
    expect(rings[0]!.hasAttribute('data-lost')).toBe(false);
  });

  it('a lost ring is marked for grey', () => {
    const dom = draw(career(), { relieving: new Set(), rings: [{ ...klcc, lost: true }] });
    expect(dom.querySelector('[data-testid="crowding-ring"]')!.getAttribute('data-lost')).toBe('true');
  });

  it('rings do not move chips', () => {
    const c = career();
    const targets = visibleTargets(net, c.sim);
    const place = () => overlayLayout(net, layout, c, targets, [], M).chips.map(({ key, x, y }) => ({ key, x, y }));
    const before = place();
    draw(c, { relieving: new Set([1]), rings: [klcc] });
    expect(place()).toEqual(before);
    expect(before.length).toBeGreaterThan(0);
  });

  it('labels keep clear of rings and of their counts', () => {
    const c = career();
    const targets = visibleTargets(net, c.sim);
    const without = overlayObstacles(net, layout, c, targets, [], M);
    const withRing = overlayObstacles(net, layout, c, targets, [], M, null, [{ ...klcc, waiting: 123 }]);
    expect(withRing.length).toBe(without.length + 2);
    const p = layout.get('klcc')!;
    const [ring, count] = withRing.slice(without.length);
    expect(ring).toEqual({
      x0: p.x - RING_CLEAR_R * M, y0: p.y - RING_CLEAR_R * M, x1: p.x + RING_CLEAR_R * M, y1: p.y + RING_CLEAR_R * M,
      owner: 'klcc', clear: (RING_R + 2) * M,
    });
    // The three-digit count starts above-right of the ring and its box covers every glyph.
    const text = render(
      <svg><DispatchOverlay net={net} layout={layout} markScale={M} career={c} targets={targets} aimed={[]}
        hint={{ relieving: new Set(), rings: [{ ...klcc, waiting: 123 }] }} /></svg>,
    ).container.querySelector('.crowding-count')!;
    const x = Number(text.getAttribute('x'));
    const y = Number(text.getAttribute('y'));
    const font = Number(text.getAttribute('font-size'));
    expect(count!.x0).toBeLessThanOrEqual(x);
    expect(count!.x1).toBeGreaterThanOrEqual(x + 3 * CHAR_EM * font);
    expect(count!.y0).toBeLessThanOrEqual(y - font);
    expect(count!.y1).toBeGreaterThanOrEqual(y);
  });

  it.each([0.7, 1, 1.5])('a ringed Station keeps its own label, clear of its ring and its count (mark scale %s)', (m) => {
    const c = career();
    const targets = visibleTargets(net, c.sim);
    const p = layout.get('klcc')!;
    const boxes = overlayObstacles(net, layout, c, targets, [], m, null, [klcc]);
    const view = { x: p.x - 200, y: p.y - 150, w: 400, h: 300 };
    const { labels, opts, text } = mapLabels({ net, layout, view, markScale: m, activeStation: null, labelled: null,
      labelOnly: new Set(['klcc']), tiers: labelTiers(net), boxes });
    expect(labels.map((l) => l.id)).toEqual(['klcc']);
    const box = labelBox(labels[0]!, text.get('klcc')!, opts);
    // The nearest point of the name to the Station is outside the ring's outer edge.
    const dx = Math.max(box.x0 - p.x, 0, p.x - box.x1);
    const dy = Math.max(box.y0 - p.y, 0, p.y - box.y1);
    expect(Math.hypot(dx, dy)).toBeGreaterThan((RING_R + RING_STROKE / 2) * m);
    const count = ringCountBox(p, klcc.waiting, m);
    expect(box.x0 < count.x1 && count.x0 < box.x1 && box.y0 < count.y1 && count.y0 < box.y1).toBe(false);
  });
});
