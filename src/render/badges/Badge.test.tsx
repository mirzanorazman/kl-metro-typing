import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from './Badge';
import { ACHIEVEMENTS } from '../../engine/achievementDefs';
import { BADGE_ART } from './art';

describe('Badge', () => {
  it('names the badge for screen readers', () => {
    render(
      <>
        <Badge id="explorer.unlocked" award="silver" size={56} />
        <Badge id="quick.jumps" award={null} size={56} />
        <Badge id="secret.sixteen" award="secret" size={56} />
        <Badge id="secret.sixteen" award={null} size={56} hidden />
      </>,
    );
    expect(screen.getByRole('img', { name: 'Jalan-Jalan, Silver' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Line Hopper, Locked' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Sweet Sixteen, Secret' })).toBeTruthy();
    // A hidden secret never gives its name away.
    expect(screen.getByRole('img', { name: 'Secret' })).toBeTruthy();
  });

  it('draws the tier metal on the frame', () => {
    const { container } = render(
      <>
        <Badge id="explorer.unlocked" award="bronze" size={56} />
        <Badge id="explorer.unlocked" award="silver" size={56} />
        <Badge id="explorer.unlocked" award="gold" size={56} />
      </>,
    );
    const strokes = [...container.querySelectorAll('.badge__frame')].map((f) => f.getAttribute('stroke'));
    expect(strokes).toHaveLength(3);
    expect(new Set(strokes).size).toBe(3);
  });

  it('marks a locked badge for the greyscale style', () => {
    const { container } = render(
      <>
        <Badge id="explorer.unlocked" award={null} size={56} />
        <Badge id="explorer.unlocked" award="gold" size={56} />
      </>,
    );
    const [locked, earned] = [...container.querySelectorAll('svg.badge')] as [Element, Element];
    expect(locked.classList.contains('badge--locked')).toBe(true);
    expect(earned.classList.contains('badge--locked')).toBe(false);
  });

  it('draws the hidden secret without its art', () => {
    const Art = BADGE_ART['dispatch.clears']!;
    const art = render(<svg><Art /></svg>).container.querySelector('svg')!.innerHTML;
    const { container } = render(
      <>
        <Badge id="dispatch.clears" award={null} size={56} />
        <Badge id="dispatch.clears" award={null} size={56} hidden />
      </>,
    );
    const [shown, hidden] = [...container.querySelectorAll('svg.badge')] as [Element, Element];
    expect(shown.innerHTML).toContain(art);
    expect(hidden.innerHTML).not.toContain(art);
    expect(hidden.classList.contains('badge--locked')).toBe(true);
    expect(hidden.querySelector('[data-badge-hidden]')).not.toBeNull();
  });

  it('has art for every achievement', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(ids).toHaveLength(47);
    expect(ids.filter((id) => !(id in BADGE_ART))).toEqual([]);
  });

  it('gives each badge its own pattern ids', () => {
    const { container } = render(
      <>
        <Badge id="explorer.unlocked" award="gold" size={56} />
        <Badge id="quick.jumps" award="gold" size={56} />
      </>,
    );
    const ids = [...container.querySelectorAll('pattern, clipPath, linearGradient')].map((p) => p.id);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    // Each badge only points at its own defs.
    for (const svg of container.querySelectorAll('svg.badge')) {
      const refs = svg.innerHTML.match(/url\(#[^)]+\)/g) ?? [];
      expect(refs.length).toBeGreaterThan(0);
      for (const ref of refs) {
        const id = ref.slice(5, -1);
        expect([...svg.querySelectorAll('[id]')].some((el) => el.id === id)).toBe(true);
      }
    }
  });
});
