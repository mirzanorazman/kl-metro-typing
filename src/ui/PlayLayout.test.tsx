import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PlayLayout } from './PlayLayout';

describe('PlayLayout', () => {
  it('dresses the panel in the colour of the current line', () => {
    const { container } = render(
      <PlayLayout map={<div />} panel={<div />} lineColour="#ED254E" />,
    );
    const panel = container.querySelector('.play-panel') as HTMLElement;
    expect(panel.style.getPropertyValue('--line-colour')).toBe('#ED254E');
  });

  it('renders without a line, before one is chosen', () => {
    const { container } = render(<PlayLayout map={<div />} panel={<div />} />);
    expect(container.querySelector('.play-panel')).not.toBeNull();
  });
});
