import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HUD } from './HUD';

import type { Metrics } from '../engine/metrics';

const metrics: Metrics = { wpm: 62, accuracy: 0.98, score: 59.5 };

describe('HUD', () => {
  it('labels every figure it shows', () => {
    const { container } = render(
      <HUD metrics={metrics} stationsThisRun={4} lineName="Kelana Jaya Line" toward="KLCC" />,
    );
    expect(container.querySelectorAll('.hud-label').length).toBe(3);
    expect(container.querySelectorAll('.hud-figure').length).toBe(3);
  });

  it('shows speed on a dial as well as in figures', () => {
    render(
      <HUD metrics={metrics} stationsThisRun={4} lineName="Kelana Jaya Line" toward="KLCC" />,
    );
    expect(screen.getByRole('img', { name: /62 words per minute/i })).toBeTruthy();
  });

  it('sets each unit apart from its figure, so the number carries the weight', () => {
    const { container } = render(
      <HUD metrics={metrics} stationsThisRun={4} lineName="Kelana Jaya Line" toward="KLCC" />,
    );
    const units = [...container.querySelectorAll('.hud-figure small')].map((el) => el.textContent);
    expect(units).toEqual(['WPM', '%', 'stations']);
  });

  it('still names the line and destination', () => {
    render(
      <HUD metrics={metrics} stationsThisRun={4} lineName="Kelana Jaya Line" toward="KLCC" />,
    );
    expect(screen.getByText(/Kelana Jaya Line/)).toBeTruthy();
    expect(screen.getByText(/KLCC/)).toBeTruthy();
  });
});
