import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { tweenPoint, TrainMarker } from './TrainMarker';
import type { Point } from '../data/types';

const a: Point = { x: 0, y: 0 };
const b: Point = { x: 100, y: 40 };

describe('tweenPoint', () => {
  it('sits at the origin at t = 0', () => {
    expect(tweenPoint(a, b, 0)).toEqual({ x: 0, y: 0 });
  });

  it('arrives exactly at t = 1', () => {
    expect(tweenPoint(a, b, 1)).toEqual({ x: 100, y: 40 });
  });

  it('interpolates in between', () => {
    expect(tweenPoint(a, b, 0.5)).toEqual({ x: 50, y: 20 });
  });
});

describe('TrainMarker', () => {
  it('sits at the destination when there is no previous station', () => {
    const { container } = render(<svg><TrainMarker from={null} to={b} /></svg>);
    const g = container.querySelector('[data-train]')!;
    expect(g.getAttribute('transform')).toContain('translate(100 40)');
  });

  it('renders nothing when the destination is unknown', () => {
    const { container } = render(<svg><TrainMarker from={a} to={null} /></svg>);
    expect(container.querySelector('[data-train]')).toBeNull();
  });

  it('points along the direction of travel', () => {
    // Travelling due east, so the carriage — drawn nose-up — turns 90deg.
    const { container } = render(
      <svg><TrainMarker from={{ x: 0, y: 0 }} to={{ x: 100, y: 0 }} /></svg>,
    );
    expect(container.querySelector('[data-train]')!.getAttribute('transform'))
      .toContain('rotate(90)');
  });

  it('wears the colour of its line on its nose', () => {
    const { container } = render(
      <svg><TrainMarker from={a} to={b} colour="#ED254E" /></svg>,
    );
    expect(container.querySelector('.train-nose')!.getAttribute('fill')).toBe('#ED254E');
  });
});
