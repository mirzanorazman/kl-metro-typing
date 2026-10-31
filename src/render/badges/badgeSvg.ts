import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { Award } from '../../engine/achievementState';
import { Badge } from './Badge';
import badgeCss from './badges.css?raw';

/**
 * An earned badge as standalone SVG markup, drawn by the same `Badge` the page
 * uses. The page's stylesheet does not reach an SVG loaded as an image, so the
 * badge styles (the off-register key line) travel inside it.
 */
export function badgeSvgMarkup(id: string, award: Award, size: number): string {
  const host = document.createElement('div');
  const root = createRoot(host);
  flushSync(() => root.render(createElement(Badge, { id, award, size })));
  const svg = host.firstElementChild!;
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = badgeCss;
  svg.insertBefore(style, svg.firstChild);
  const markup = new XMLSerializer().serializeToString(svg);
  root.unmount();
  return markup;
}

/**
 * The badge as an image a canvas can draw, made from its own markup in a
 * `data:` URL, so nothing is fetched. Null where it cannot be decoded.
 */
export async function loadBadgeImage(id: string, award: Award, size: number): Promise<HTMLImageElement | null> {
  // Callers ask from inside a React effect, where a nested render cannot
  // flush; a microtask later, React has finished.
  await Promise.resolve();
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(badgeSvgMarkup(id, award, size))}`;
  return new Promise((resolve) => {
    const img = new Image(size, size);
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
