import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { LeaderboardTrack, trackPath } from './LeaderboardTrack';

function reducedMotion(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: matches && query.includes('reduce'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
}

/** jsdom lays nothing out, so the box reports the size a browser would. */
function boxSize(width: number, height: number) {
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(width);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(height);
}

/** Selectors can't be trusted with SVG's camelCase tag names in jsdom, so look them up by name. */
const moving = (el: Element) => [...el.getElementsByTagName('animate'), ...el.getElementsByTagName('animateMotion')];
const follower = (el: Element) => el.getElementsByTagName('animateMotion')[0]!;

const renderInBox = () => render(<div className="leaderboard-panel"><LeaderboardTrack /></div>);

describe('LeaderboardTrack', () => {
  beforeEach(() => boxSize(300, 120));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('runs the track round the edge of the box it sits in, corners and all', () => {
    reducedMotion(false);
    const { container } = renderInBox();
    const rail = container.querySelector('.leaderboard-track-rail')!;
    expect(rail.getAttribute('d')).toBe(trackPath(300, 120));
    expect(trackPath(300, 120)).toBe(
      'M 150,0 H 290 A 10 10 0 0 1 300,10 V 110 A 10 10 0 0 1 290,120 H 10 A 10 10 0 0 1 0,110 '
      + 'V 10 A 10 10 0 0 1 10,0 Z',
    );
    expect(container.querySelector('svg.leaderboard-track')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('laps a train, its glow ahead on the track and its headlight together', () => {
    reducedMotion(false);
    const { container } = renderInBox();
    const train = container.querySelector('.leaderboard-track-train')!;
    const beam = container.querySelector('.leaderboard-track-beam')!;
    expect(follower(train).getAttribute('path')).toBe(trackPath(300, 120));
    expect(follower(beam).getAttribute('path')).toBe(trackPath(300, 120));
    const laps = moving(container).map((a) => a.getAttribute('dur'));
    expect(laps).toHaveLength(4);
    expect(new Set(laps).size).toBe(1);
  });

  it('keeps the headlight outside the box, off the text and the controls', () => {
    reducedMotion(false);
    const { container } = renderInBox();
    const masked = container.querySelector('.leaderboard-track-beam')!.closest('[mask]')!;
    const id = masked.getAttribute('mask')!.match(/^url\(#(.+)\)$/)![1]!;
    const cutout = container.querySelector(`mask[id="${id}"] rect[fill="black"]`)!;
    expect(cutout).not.toBeNull();
    expect(cutout.getAttribute('rx')).not.toBeNull();
  });

  it('parks the train at the top under reduced motion, with nothing moving', () => {
    reducedMotion(true);
    const { container } = renderInBox();
    expect(container.querySelector('.leaderboard-track-train')).not.toBeNull();
    expect(moving(container)).toHaveLength(0);
    expect(container.querySelector('.leaderboard-track-train')!.getAttribute('transform')).toBe('translate(150 0)');
  });

  it('draws nothing until the box has a size', () => {
    reducedMotion(false);
    boxSize(0, 0);
    const { container } = renderInBox();
    expect(container.querySelector('svg.leaderboard-track')!.childElementCount).toBe(0);
  });
});
