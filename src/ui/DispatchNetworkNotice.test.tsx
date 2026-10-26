import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildNetwork } from '../engine/network';
import { loadNetworkData } from '../data/load';
import { DispatchNetworkNotice } from './DispatchNetworkNotice';

const net = buildNetwork(loadNetworkData());

describe('DispatchNetworkNotice', () => {
  it('announces the Line code and full name in normal flow without taking focus', () => {
    const view = render(<button type="button">Keep focus</button>);
    const button = screen.getByRole('button');
    button.focus();
    fireEvent.focus(button);
    view.rerender(<><button type="button">Keep focus</button><DispatchNetworkNotice net={net} line="SP" /></>);
    const notice = screen.getByRole('status', { name: 'New Line' });
    expect(notice.className).toBe('dispatch-network-notice');
    expect(notice.querySelector('.line-badge')!.textContent).toBe('SP');
    expect(notice.textContent).toContain(`${net.lines.get('SP')!.name} joins the network`);
    expect(notice.querySelector('button')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('pops briefly, has an opaque token background and stands still with reduced motion', () => {
    const css = readFileSync('src/ui/dispatch.css', 'utf8');
    expect(css).toMatch(/\.dispatch-network-notice\s*\{[^}]*background:[^;]*var\(--paper\)/);
    expect(css).toMatch(/\.dispatch-network-notice\s*\{[^}]*animation:[^;]*240ms/);
    expect(css).toMatch(/prefers-reduced-motion[^}]*\.dispatch-network-notice\s*\{\s*animation:\s*none/s);
  });
});
