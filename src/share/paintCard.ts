import type { Point } from '../data/types';
import { networkLayout } from '../geo/networkLayout';
import { contrastHex } from '../render/contrast';
import { CARD_MAP, CARD_SIZE, SHARE_URL, type CardPath, type ShareCard } from './shareCard';

/**
 * The card is always dark, whatever the player's theme, so it mirrors the
 * midnight tokens in src/styles/tokens.css and the brand card in
 * assets/brand/social-card.svg by hand: a canvas cannot read CSS custom
 * properties.
 */
const C = {
  paper: '#0b0f17',
  panel: '#0e1420',
  land: '#141d2e',
  edge: '#1f293d',
  ink: '#f8fafc',
  muted: '#94a3b8',
  faint: '#475569',
  closed: '#ef4444',
  verified: '#22c55e',
  roundelRed: '#ed254e',
  roundelOrange: '#f78f1e',
  roundelBox: '#101725',
};

const SANS = "'Plus Jakarta Sans Variable', ui-sans-serif, system-ui, sans-serif";
const MONO = "'JetBrains Mono Variable', ui-monospace, SFMono-Regular, monospace";

/** Left and right margin. */
const M = 48;
const INNER = CARD_SIZE - 2 * M;

function font(ctx: CanvasRenderingContext2D, weight: number, size: number, family: string) {
  ctx.font = `${weight} ${size}px ${family}`;
}

/**
 * Sets the largest font from `size` down to `min` at which `text` fits in
 * `width`, and returns the text, cut with an ellipsis if even `min` is too wide.
 */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  weight: number,
  size: number,
  min: number,
  family: string,
): string {
  for (let s = size; s >= min; s -= 2) {
    font(ctx, weight, s, family);
    if (ctx.measureText(text).width <= width) return text;
  }
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** The station roundel from the brand card, `size` pixels square. */
function roundel(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const k = size / 88;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  roundRect(ctx, 0, 0, 88, 88, 19);
  ctx.fillStyle = C.roundelBox;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(44, 44, 29, 0, Math.PI * 2);
  ctx.fillStyle = C.roundelRed;
  ctx.fill();
  ctx.lineCap = 'round';
  ctx.lineWidth = 9;
  ctx.strokeStyle = C.roundelOrange;
  ctx.beginPath();
  ctx.moveTo(10, 44);
  ctx.lineTo(25, 44);
  ctx.moveTo(63, 44);
  ctx.lineTo(78, 44);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(44, 44, 15, 0, Math.PI * 2);
  ctx.fillStyle = C.ink;
  ctx.fill();
  ctx.restore();
}

function header(ctx: CanvasRenderingContext2D, card: ShareCard) {
  roundel(ctx, M, 52, 64);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  font(ctx, 700, 28, SANS);
  ctx.fillStyle = C.ink;
  ctx.fillText('KL-METRO TYPING', M + 84, 95);
  ctx.textAlign = 'right';
  font(ctx, 600, 24, MONO);
  ctx.fillStyle = C.muted;
  ctx.fillText(card.mode, CARD_SIZE - M, 95);
  ctx.textAlign = 'left';
}

/** A Line code on a tablet of its colour; returns the tablet's width. */
function lineBadge(ctx: CanvasRenderingContext2D, x: number, y: number, code: string, colour: string): number {
  font(ctx, 700, 22, MONO);
  const w = Math.ceil(ctx.measureText(code).width) + 24;
  roundRect(ctx, x, y, w, 38, 8);
  ctx.fillStyle = colour;
  ctx.fill();
  ctx.fillStyle = contrastHex(colour);
  ctx.fillText(code, x + 12, y + 27);
  return w;
}

function titles(ctx: CanvasRenderingContext2D, card: ShareCard) {
  ctx.fillStyle = C.ink;
  ctx.fillText(fitText(ctx, card.title, INNER, 800, 62, 38, SANS), M, 214);

  let x = M;
  for (const line of card.lines) x += lineBadge(ctx, x, 248, line.code, line.colour) + 10;
  if (card.lines.length > 0) x += 8;
  const subtitle = fitText(ctx, card.subtitle, CARD_SIZE - M - x, 500, 28, 20, SANS);
  ctx.fillStyle = C.muted;
  ctx.fillText(subtitle, x, 277);
}

function trace(ctx: CanvasRenderingContext2D, pts: readonly Point[]) {
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
}

function map(ctx: CanvasRenderingContext2D, card: ShareCard) {
  const { x, y, w, h } = CARD_MAP;
  const { view } = card.map;
  const k = w / view.w;
  const at = (p: Point): Point => ({ x: x + (p.x - view.x) * k, y: y + (p.y - view.y) * k });
  const path = (p: CardPath) => p.points.map(at);

  ctx.save();
  roundRect(ctx, x, y, w, h, 20);
  ctx.fillStyle = C.panel;
  ctx.fill();
  ctx.clip();

  ctx.fillStyle = C.land;
  for (const region of networkLayout().backdrop) {
    trace(ctx, region.points.map(at));
    ctx.closePath();
    ctx.fill();
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = 5;
  for (const line of card.map.network) {
    ctx.strokeStyle = line.colour;
    trace(ctx, path(line));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // A dark casing first, so the route reads where it crosses a faint line.
  ctx.strokeStyle = C.paper;
  ctx.lineWidth = 20;
  for (const p of card.map.route) {
    trace(ctx, path(p));
    ctx.stroke();
  }
  for (const p of card.map.route) {
    ctx.setLineDash(p.line ? [] : [2, 14]);
    ctx.lineWidth = p.line ? 11 : 7;
    ctx.strokeStyle = p.colour;
    trace(ctx, path(p));
    ctx.stroke();
  }
  ctx.setLineDash([]);

  ctx.lineWidth = 3;
  ctx.strokeStyle = C.paper;
  ctx.fillStyle = C.ink;
  for (const s of card.map.stops) {
    const p = at(s);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // The ends differ by shape, not colour: a ring where the Run began, a solid
  // disc where it finished.
  if (card.map.start) {
    const p = at(card.map.start);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
    ctx.fillStyle = C.paper;
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
  }
  if (card.map.end) {
    const p = at(card.map.end);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 15, 0, Math.PI * 2);
    ctx.fillStyle = C.ink;
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = C.paper;
    ctx.stroke();
  }

  for (const c of card.map.closed) {
    const p = at(c);
    for (const [width, colour] of [[13, C.paper], [6, C.closed]] as const) {
      ctx.lineWidth = width;
      ctx.strokeStyle = colour;
      ctx.beginPath();
      ctx.moveTo(p.x - 11, p.y - 11);
      ctx.lineTo(p.x + 11, p.y + 11);
      ctx.moveTo(p.x + 11, p.y - 11);
      ctx.lineTo(p.x - 11, p.y + 11);
      ctx.stroke();
    }
  }

  ctx.restore();
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 20);
  ctx.lineWidth = 1;
  ctx.strokeStyle = C.edge;
  ctx.stroke();
}

function stats(ctx: CanvasRenderingContext2D, card: ShareCard) {
  const n = Math.max(1, card.stats.length);
  const col = INNER / n;
  card.stats.forEach((stat, i) => {
    const x = M + i * col;
    ctx.fillStyle = C.ink;
    ctx.fillText(fitText(ctx, stat.value, col - 20, 700, 76, 40, MONO), x, 932);
    font(ctx, 600, 22, SANS);
    ctx.fillStyle = C.muted;
    ctx.fillText(stat.label.toUpperCase(), x, 972);
  });
}

function tick(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + 6, y + 6);
  ctx.lineTo(x + 17, y - 6);
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function footer(ctx: CanvasRenderingContext2D, card: ShareCard) {
  const url = SHARE_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');
  font(ctx, 500, 22, SANS);
  ctx.textAlign = 'right';
  ctx.fillStyle = C.faint;
  ctx.fillText(url, CARD_SIZE - M, 1040);
  ctx.textAlign = 'left';
  const limit = CARD_SIZE - M - ctx.measureText(url).width - 24;

  let x = M;
  for (const badge of card.badges) {
    const verified = badge === 'Verified';
    font(ctx, 700, 22, SANS);
    const textW = Math.ceil(ctx.measureText(badge).width);
    const w = textW + 36 + (verified ? 28 : 0);
    if (x + w > limit) break;
    roundRect(ctx, x, 1006, w, 46, 23);
    ctx.lineWidth = 2;
    ctx.strokeStyle = verified ? C.verified : C.faint;
    ctx.stroke();
    ctx.fillStyle = verified ? C.verified : C.ink;
    ctx.strokeStyle = C.verified;
    if (verified) tick(ctx, x + 18, 1030);
    ctx.fillText(badge, x + 18 + (verified ? 28 : 0), 1037);
    x += w + 12;
  }
}

/** Draws `card` on a CARD_SIZE-square context. */
export function paintCard(ctx: CanvasRenderingContext2D, card: ShareCard): void {
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, CARD_SIZE, CARD_SIZE);
  header(ctx, card);
  titles(ctx, card);
  map(ctx, card);
  stats(ctx, card);
  footer(ctx, card);
}
