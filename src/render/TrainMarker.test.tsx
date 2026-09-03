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
  it('renders at the destination when there is no previous station', () => {
    const { container } = render(
      <svg><TrainMarker from={null} to={b} /></svg>,
    );
    const c = container.querySelector('circle[data-train]')!;
    expect(c.getAttribute('cx')).toBe('100');
  });

  it('renders nothing when the destination is unknown', () => {
    const { container } = render(<svg><TrainMarker from={a} to={null} /></svg>);
    expect(container.querySelector('circle[data-train]')).toBeNull();
  });
});
