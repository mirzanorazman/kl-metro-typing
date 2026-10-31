import { createElement, useEffect } from 'react';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { badgeSvgMarkup, loadBadgeImage } from './badgeSvg';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('badgeSvgMarkup', () => {
  it('is a standalone SVG at the size asked, carrying its own key-line style', () => {
    const svg = badgeSvgMarkup('explorer.unlocked', 'gold', 480);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('width="480"');
    expect(svg).toMatch(/<style>[^<]*\.badge__key/);
    expect(svg).toMatch(/^<svg[^>]* class="badge"[ >]/);
  });

  it('resolves every reference inside its own markup', () => {
    for (const svg of [badgeSvgMarkup('explorer.unlocked', 'gold', 480), badgeSvgMarkup('secret.ampang', 'secret', 480)]) {
      const ids = new Set([...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
      const refs = [...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);
      expect(refs.length).toBeGreaterThan(0);
      for (const ref of refs) expect(ids.has(ref)).toBe(true);
    }
  });
});

describe('loadBadgeImage', () => {
  it('gives null when the image cannot be decoded', async () => {
    vi.stubGlobal('Image', class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_: string) {
        queueMicrotask(() => this.onerror?.());
      }
    });
    await expect(loadBadgeImage('explorer.unlocked', 'gold', 480)).resolves.toBeNull();
  });

  it('loads from the markup itself, not from the network', async () => {
    let seen = '';
    vi.stubGlobal('Image', class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(value: string) {
        seen = value;
        queueMicrotask(() => this.onload?.());
      }
    });
    await expect(loadBadgeImage('explorer.unlocked', 'gold', 480)).resolves.not.toBeNull();
    expect(seen.startsWith('data:image/svg+xml')).toBe(true);
  });

  it('can be asked for from inside a React effect, as the share sheet does', async () => {
    let seen = '';
    vi.stubGlobal('Image', class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(value: string) {
        seen = value;
        queueMicrotask(() => this.onload?.());
      }
    });
    let loaded: Promise<unknown> = Promise.resolve(null);
    function Asker() {
      useEffect(() => {
        loaded = loadBadgeImage('explorer.unlocked', 'gold', 480);
      }, []);
      return null;
    }
    render(createElement(Asker));
    await expect(loaded).resolves.not.toBeNull();
    expect(decodeURIComponent(seen)).toContain('Jalan-Jalan');
  });
});
