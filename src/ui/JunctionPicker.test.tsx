import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { loadNetworkData } from '../data/load';
import { buildNetwork, onwardOptions } from '../engine/network';
import { JunctionPicker, matchOption } from './JunctionPicker';
import { TypingInputProvider } from './TypingInputProvider';

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
    render(
      <TypingInputProvider enabled={false}>
        <JunctionPicker net={net} options={options} walk={[]} onChoose={() => {}} onWalk={() => {}} />
      </TypingInputProvider>,
    );
    expect(screen.getAllByRole('button')).toHaveLength(options.length);
  });

  it('chooses on click', () => {
    let picked = '';
    render(
      <TypingInputProvider enabled={false}>
        <JunctionPicker net={net} options={options} walk={[]} onChoose={(d) => (picked = d.next)} onWalk={() => {}} />
      </TypingInputProvider>,
    );
    fireEvent.click(screen.getAllByRole('button')[0]!);
    expect(picked).toBe(options[0]!.next);
  });

  it('focuses the native input before choosing a direction', () => {
    render(
      <TypingInputProvider enabled>
        <JunctionPicker
          net={net}
          options={options}
          walk={[]}
          onChoose={() => {
            expect(document.activeElement).toBe(
              screen.getByRole('textbox', { name: 'Typing input for Station name' }),
            );
          }}
          onWalk={() => {}}
        />
      </TypingInputProvider>,
    );

    fireEvent.click(screen.getAllByRole('button')[0]!);
  });

  it('focuses the native input before walking to a linked station', () => {
    render(
      <TypingInputProvider enabled>
        <JunctionPicker
          net={net}
          options={options}
          walk={['imbi']}
          onChoose={() => {}}
          onWalk={() => {
            expect(document.activeElement).toBe(
              screen.getByRole('textbox', { name: 'Typing input for Station name' }),
            );
          }}
        />
      </TypingInputProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /walk to imbi/i }));
  });

  it('focuses the native input before choosing from the keyboard', () => {
    render(
      <TypingInputProvider enabled>
        <JunctionPicker
          net={net}
          options={options}
          walk={[]}
          onChoose={() => {
            expect(document.activeElement).toBe(
              screen.getByRole('textbox', { name: 'Typing input for Station name' }),
            );
          }}
          onWalk={() => {}}
        />
      </TypingInputProvider>,
    );

    fireEvent.input(
      screen.getByRole('textbox', { name: 'Typing input for Station name' }),
      { target: { value: '1' } },
    );
  });
});
