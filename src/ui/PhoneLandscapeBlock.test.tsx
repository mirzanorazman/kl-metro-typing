import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PhoneLandscapeBlock } from './PhoneLandscapeBlock';

describe('PhoneLandscapeBlock', () => {
  it('announces the shared portrait instruction', () => {
    render(<PhoneLandscapeBlock />);
    expect(screen.getByRole('status').textContent).toBe('Rotate to portrait to play');
  });
});
