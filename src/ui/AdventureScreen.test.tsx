import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork } from '../engine/network';
import { loadProfile } from '../engine/progress';
import { AdventureScreen } from './AdventureScreen';

const net = buildNetwork(loadNetworkData());
const type = (text: string) => {
  for (const ch of text) fireEvent.keyDown(window, { key: ch });
};

const originalRect = Element.prototype.getBoundingClientRect;

beforeEach(() => {
  localStorage.clear();
  // jsdom has no layout, and the follow camera sizes itself in what the
  // player sees; reduced motion lands each fit immediately.
  Element.prototype.getBoundingClientRect = function () {
    return { x: 0, y: 0, top: 0, left: 0, right: 1512, bottom: 690,
      width: 1512, height: 690, toJSON: () => ({}) } as DOMRect;
  };
  window.matchMedia = ((q: string) => ({
    matches: true, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => { Element.prototype.getBoundingClientRect = originalRect; });

describe('AdventureScreen', () => {
  it('shows the start station name to type', () => {
    render(<AdventureScreen net={net} startAt="imbi" onExit={() => {}} />);
    expect(screen.getByLabelText('Type Imbi')).toBeTruthy();
  });

  it('opens the junction picker once the name is typed', () => {
    render(<AdventureScreen net={net} startAt="imbi" onExit={() => {}} />);
    type('Imbi');
    expect(screen.getByRole('group', { name: /choose a direction/i })).toBeTruthy();
  });

  it('persists the visited station', () => {
    render(<AdventureScreen net={net} startAt="imbi" onExit={() => {}} />);
    type('Imbi');
    expect(loadProfile().visited).toContain('imbi');
  });

  it('rides at close-up zoom rather than framing the whole network', async () => {
    const { container } = render(<AdventureScreen net={net} startAt="imbi" onExit={() => {}} />);
    // Adventure passes no fitTo at all, so before the follow camera it ran the
    // entire game at whole-network zoom — worse than a long line run.
    await waitFor(() => {
      const [, , w, h] = container.querySelector('svg.map-canvas')!
        .getAttribute('viewBox')!
        .split(' ')
        .map(Number) as [number, number, number, number];
      expect(Math.max(w, h)).toBeLessThanOrEqual(420);
    });
  });

  it('frames the stations a junction could take you to', async () => {
    const { container } = render(<AdventureScreen net={net} startAt="imbi" onExit={() => {}} />);
    type('Imbi');
    await waitFor(() => {
      const [x, y, w, h] = container.querySelector('svg.map-canvas')!
        .getAttribute('viewBox')!
        .split(' ')
        .map(Number) as [number, number, number, number];
      expect(Math.max(w, h)).toBeLessThanOrEqual(420);
      const candidates = container.querySelectorAll('circle[data-next="true"]');
      expect(candidates.length).toBeGreaterThan(0);
      for (const mark of candidates) {
        expect(Number(mark.getAttribute('cx'))).toBeGreaterThanOrEqual(x);
        expect(Number(mark.getAttribute('cx'))).toBeLessThanOrEqual(x + w);
        expect(Number(mark.getAttribute('cy'))).toBeGreaterThanOrEqual(y);
        expect(Number(mark.getAttribute('cy'))).toBeLessThanOrEqual(y + h);
      }
    });
  });

  it('keeps geographic watermarks off the schematic diagram', () => {
    const { container } = render(<AdventureScreen net={net} startAt="kl-sentral" onExit={() => {}} />);
    // Adventure opens in schematic mode, where a lat/lng-anchored district
    // name would float at a position the diagram does not share.
    expect(container.querySelectorAll('text[data-watermark]')).toHaveLength(0);
  });
});
