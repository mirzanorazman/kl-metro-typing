import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork, onwardOptions } from '../engine/network';
import { JunctionPicker, matchOption } from './JunctionPicker';

const net = buildNetwork(loadNetworkData());
const options = onwardOptions(net, 'raja-chulan', null);

describe('matchOption', () => {
  it('selects by position with a number key', () => {
    expect(matchOption(options, '1')).toBe(options[0]);
  });

  it('ignores a number beyond the option count', () => {
    expect(matchOption(options, '9')).toBeUndefined();
  });

  it('selects by line code, case-insensitively', () => {
    expect(matchOption(options, 'm')?.line).toBe('MR');
  });
});

describe('JunctionPicker', () => {
  it('lists every option with its number and destination', () => {
    render(<JunctionPicker net={net} options={options} walk={[]} onChoose={() => {}} onWalk={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(options.length);
  });

  it('chooses on click', () => {
    let picked = '';
    render(
      <JunctionPicker net={net} options={options} walk={[]} onChoose={(d) => (picked = d.next)} onWalk={() => {}} />,
    );
    fireEvent.click(screen.getAllByRole('button')[0]!);
    expect(picked).toBe(options[0]!.next);
  });
});
