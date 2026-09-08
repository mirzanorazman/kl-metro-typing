import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { LineBadge } from './LineBadge';

describe('LineBadge', () => {
  it('always renders the line code as text, never colour alone', () => {
    const { container } = render(<LineBadge code="KJ" colour="#ED254E" />);
    const badge = container.querySelector('.line-badge') as HTMLElement;
    expect(badge.textContent).toBe('KJ');
  });

  it('picks its foreground from a badge token, not a raw hex', () => {
    const { container } = render(<LineBadge code="KJ" colour="#ED254E" />);
    const badge = container.querySelector('.line-badge') as HTMLElement;
    expect(badge.style.color).toMatch(/^var\(--badge-(ink|paper)\)$/);
  });
});
