import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MobileShell } from './MobileShell';

const originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');
const originalVisualViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');

function restoreWindowProperty(name: 'innerHeight' | 'visualViewport', descriptor?: PropertyDescriptor) {
  if (descriptor) {
    Object.defineProperty(window, name, descriptor);
  } else {
    delete (window as unknown as Record<string, unknown>)[name];
  }
}

function installVisualViewport(initialHeight: number) {
  let height = initialHeight;
  const listeners = new Map<string, EventListener>();
  const viewport = {
    get height() {
      return height;
    },
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      listeners.set(type, listener);
    }),
    removeEventListener: vi.fn(),
  } as unknown as VisualViewport;

  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: viewport,
  });

  return {
    setHeight(nextHeight: number) {
      height = nextHeight;
    },
    dispatch(type: 'resize' | 'scroll') {
      listeners.get(type)?.(new Event(type));
    },
  };
}

beforeEach(() => {
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: 844,
  });
});

afterEach(() => {
  restoreWindowProperty('innerHeight', originalInnerHeight);
  restoreWindowProperty('visualViewport', originalVisualViewport);
  vi.restoreAllMocks();
});

describe('MobileShell', () => {
  it('renders the brand and destination content in the shell structure', () => {
    installVisualViewport(700);
    const { container } = render(
      <MobileShell active="transit" onNavigate={() => {}}>
        <div>Transit content</div>
      </MobileShell>,
    );

    const shell = container.querySelector('.mobile-shell');
    const header = container.querySelector('.mobile-header');
    const destination = container.querySelector('.mobile-destination');
    const nav = screen.getByRole('navigation', { name: 'Primary' });

    expect(screen.getByText('KL-Metro Typing')).toBeTruthy();
    expect(screen.getByText('Transit content')).toBeTruthy();
    expect(shell?.children[0]).toBe(header);
    expect(shell?.children[1]).toBe(destination);
    expect(shell?.children[2]).toBe(nav);
    expect(header?.tagName).toBe('HEADER');
    expect(nav.tagName).toBe('NAV');
  });

  it('renders the three destinations in the exact order', () => {
    installVisualViewport(700);
    render(
      <MobileShell active="transit" onNavigate={() => {}}>
        Content
      </MobileShell>,
    );

    expect(
      screen.getByRole('navigation', { name: 'Primary' })
        .querySelectorAll('button'),
    ).toHaveLength(3);
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Transit',
      'Adventure',
      'Ranking',
    ]);
  });

  it('marks only the active destination as the current page', () => {
    installVisualViewport(700);
    render(
      <MobileShell active="adventure" onNavigate={() => {}}>
        Content
      </MobileShell>,
    );

    expect(screen.getByRole('button', { name: 'Transit' }).hasAttribute('aria-current')).toBe(false);
    expect(screen.getByRole('button', { name: 'Adventure' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'Ranking' }).hasAttribute('aria-current')).toBe(false);
  });

  it('reports the exact destination for every navigation click', () => {
    installVisualViewport(700);
    const onNavigate = vi.fn();
    render(
      <MobileShell active="transit" onNavigate={onNavigate}>
        Content
      </MobileShell>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Transit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Adventure' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ranking' }));

    expect(onNavigate.mock.calls.map(([destination]) => destination)).toEqual([
      'transit',
      'adventure',
      'ranking',
    ]);
  });

  it('tracks the visual viewport height after resize', () => {
    const visualViewport = installVisualViewport(700);
    const { container } = render(
      <MobileShell active="transit" onNavigate={() => {}}>
        Content
      </MobileShell>,
    );
    const shell = container.querySelector('.mobile-shell') as HTMLElement;

    expect(shell.style.height).toBe('700px');

    act(() => {
      visualViewport.setHeight(430);
      visualViewport.dispatch('resize');
    });

    expect(shell.style.height).toBe('430px');
  });
});
