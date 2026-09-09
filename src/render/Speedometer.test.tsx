import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Speedometer, gaugeAngle, GAUGE_SWEEP } from './Speedometer';

describe('gaugeAngle', () => {
  it('rests the needle at the left end of the sweep for zero', () => {
    expect(gaugeAngle(0, 120)).toBe(-GAUGE_SWEEP / 2);
  });

  it('swings the needle to the right end at full scale', () => {
    expect(gaugeAngle(120, 120)).toBe(GAUGE_SWEEP / 2);
  });

  it('points straight up at half scale', () => {
    expect(gaugeAngle(60, 120)).toBe(0);
  });

  it('pins a value past full scale to the right end', () => {
    expect(gaugeAngle(400, 120)).toBe(GAUGE_SWEEP / 2);
  });

  it('pins a negative value to the left end', () => {
    expect(gaugeAngle(-20, 120)).toBe(-GAUGE_SWEEP / 2);
  });
});

describe('Speedometer', () => {
  it('reads its value out for anyone who cannot see the needle', () => {
    render(<Speedometer wpm={42.4} />);
    expect(screen.getByRole('img', { name: /42 words per minute/i })).toBeTruthy();
  });

  it('labels the figure it shows', () => {
    const { container } = render(<Speedometer wpm={42.4} />);
    expect(container.querySelector('.hud-label')?.textContent).toMatch(/speed/i);
    expect(container.querySelector('.hud-figure')?.textContent).toMatch(/42/);
  });

  it('groups its caption and figure apart from the dial, so they can sit beside it', () => {
    const { container } = render(<Speedometer wpm={42.4} />);
    const readout = container.querySelector('.hud-readout');
    expect(readout?.querySelector('.hud-label')).toBeTruthy();
    expect(readout?.querySelector('.hud-figure')).toBeTruthy();
    expect(readout?.querySelector('svg')).toBeNull();
  });
});
