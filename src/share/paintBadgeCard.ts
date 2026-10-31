import type { Point } from '../data/types';
import type { NetworkIndex } from '../engine/network';
import { coverAspect, fitViewBox } from '../geo/fit';
import { networkLayout } from '../geo/networkLayout';
import type { BadgeCard } from './badgeCard';
import { C, fitText, font, MONO, SANS, trace } from './paintCard';
import { CARD_SIZE, networkPaths, SHARE_URL } from './shareCard';

/** The badge's size on the card, in pixels. */
export const BADGE_SIZE = 480;

const BADGE_TOP = 180;
const CENTRE = CARD_SIZE / 2;
/** Gold's mid metal: bright on the dark card, where the tier's words carry the meaning. */
const GOLD = '#e2a72a';

/** Every Line, faint, filling the square, over the land: this is a game about the map. */
function network(ctx: CanvasRenderingContext2D, net: NetworkIndex) {
  const paths = networkPaths(net);
  const view = coverAspect(fitViewBox(paths.flatMap((p) => p.points), 0.06), 1);
  const k = CARD_SIZE / view.w;
  const at = (p: Point): Point => ({ x: (p.x - view.x) * k, y: (p.y - view.y) * k });

  ctx.fillStyle = C.land;
  for (const region of networkLayout().backdrop) {
    trace(ctx, region.points.map(at));
    ctx.closePath();
    ctx.fill();
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 10;
  for (const line of paths) {
    ctx.strokeStyle = line.colour;
    trace(ctx, line.points.map(at));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Draws `card` on a CARD_SIZE-square context, with `badge` already decoded. */
export function paintBadgeCard(
  ctx: CanvasRenderingContext2D,
  card: BadgeCard,
  badge: CanvasImageSource,
  net: NetworkIndex,
): void {
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, CARD_SIZE, CARD_SIZE);
  network(ctx, net);

  // A dark disc keeps the badge clear of the lines behind it.
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = C.paper;
  ctx.beginPath();
  ctx.arc(CENTRE, BADGE_TOP + BADGE_SIZE / 2, BADGE_SIZE * 0.66, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.drawImage(badge, CENTRE - BADGE_SIZE / 2, BADGE_TOP, BADGE_SIZE, BADGE_SIZE);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.ink;
  ctx.fillText(fitText(ctx, card.name, CARD_SIZE - 2 * 64, 800, 80, 48, SANS), CENTRE, 780);

  ctx.fillStyle = card.award === 'gold' ? GOLD : C.ink;
  ctx.fillText(fitText(ctx, card.tier.toUpperCase(), CARD_SIZE - 2 * 64, 700, 32, 22, MONO), CENTRE, 840);

  font(ctx, 700, 30, SANS);
  ctx.fillStyle = C.ink;
  ctx.fillText('KL-METRO TYPING', CENTRE, 960);

  const address = SHARE_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');
  font(ctx, 500, 24, SANS);
  ctx.fillStyle = C.muted;
  ctx.fillText(`Type your way across the Klang Valley · ${address}`, CENTRE, 1004);
  ctx.textAlign = 'left';
}
