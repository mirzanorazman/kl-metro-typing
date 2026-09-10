import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MobileDrawer } from './MobileDrawer';

describe('MobileDrawer', () => {
  it('defaults to expanded with its child content mounted', () => {
    const { container } = render(
      <MobileDrawer title="Choose a line" subtitle="Seven routes">
        <div>Drawer content</div>
      </MobileDrawer>,
    );

    const drawer = container.querySelector('.mobile-drawer');
    const toggle = screen.getByRole('button', { name: 'Collapse setup' });
    expect(drawer?.getAttribute('data-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('.mobile-drawer-content')).toBeTruthy();
    expect(screen.getByText('Drawer content')).toBeTruthy();
  });

  it('supports an initially compact drawer while keeping its labels visible', () => {
    const { container } = render(
      <MobileDrawer title="Choose a line" subtitle="Seven routes" initiallyExpanded={false}>
        <div>Drawer content</div>
      </MobileDrawer>,
    );

    expect(container.querySelector('.mobile-drawer')?.getAttribute('data-expanded')).toBe('false');
    expect(screen.getByRole('button', { name: 'Expand setup' }).getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('.mobile-drawer-content')).toBeNull();
    expect(screen.getByText('Choose a line')).toBeTruthy();
    expect(screen.getByText('Seven routes')).toBeTruthy();
  });

  it('unmounts and remounts content through the toggle', () => {
    const { container } = render(
      <MobileDrawer title="Choose a line" subtitle="Seven routes">
        <div>Drawer content</div>
      </MobileDrawer>,
    );
    const firstContent = container.querySelector('.mobile-drawer-content');

    fireEvent.click(screen.getByRole('button', { name: 'Collapse setup' }));

    expect(container.querySelector('.mobile-drawer')?.getAttribute('data-expanded')).toBe('false');
    expect(container.querySelector('.mobile-drawer-content')).toBeNull();
    expect(screen.getByText('Choose a line')).toBeTruthy();
    expect(screen.getByText('Seven routes')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Expand setup' }));

    const remountedContent = container.querySelector('.mobile-drawer-content');
    expect(container.querySelector('.mobile-drawer')?.getAttribute('data-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Collapse setup' }).getAttribute('aria-expanded')).toBe('true');
    expect(remountedContent).toBeTruthy();
    expect(remountedContent).not.toBe(firstContent);
  });

  it('renders a decorative chevron', () => {
    const { container } = render(
      <MobileDrawer title="Choose a line" subtitle="Seven routes">
        Content
      </MobileDrawer>,
    );

    expect(container.querySelector('.mobile-drawer-chevron')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('does not expose pointer, touch, or drag interactions', () => {
    const { container } = render(
      <MobileDrawer title="Choose a line" subtitle="Seven routes">
        Content
      </MobileDrawer>,
    );
    const drawer = container.querySelector('.mobile-drawer') as HTMLElement;
    const toggle = screen.getByRole('button', { name: 'Collapse setup' });
    const click = vi.fn();
    toggle.addEventListener('click', click);

    fireEvent.pointerDown(drawer);
    fireEvent.touchStart(drawer);
    fireEvent.dragStart(drawer);

    const handlerAttributes = [...container.querySelectorAll('*')]
      .flatMap((element) => element.getAttributeNames())
      .filter((name) => /^on(pointer|touch|drag)/.test(name));
    expect(handlerAttributes).toEqual([]);
    expect(drawer.getAttribute('data-expanded')).toBe('true');
    expect(click).not.toHaveBeenCalled();
  });
});
