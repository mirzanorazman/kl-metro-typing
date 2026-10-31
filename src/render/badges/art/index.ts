import { CRAFT_ART } from './craft';
import { DISPATCH_ART } from './dispatch';
import { EXPLORER_ART } from './explorer';
import { LINE_ART } from './line';
import { QUICK_ART } from './quick';
import { SECRET_ART } from './secret';

/**
 * Every badge drawing, by achievement id. A drawing sits in the 0 0 200 200
 * box the frame scales it into; filled shapes get the frame's key line, and
 * strokes drawn with `fill="none"` don't.
 */
export const BADGE_ART: Partial<Record<string, () => JSX.Element>> = {
  ...EXPLORER_ART,
  ...LINE_ART,
  ...QUICK_ART,
  ...DISPATCH_ART,
  ...CRAFT_ART,
  ...SECRET_ART,
};
