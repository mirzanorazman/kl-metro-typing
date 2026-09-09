import type { LineCode } from '../data/types';
import { contrastText } from '../render/contrast';

/**
 * A line's code, on a tablet in the line's colour.
 *
 * The code stays real text, never a bare coloured square: colour is never the
 * only signal in this app.
 */
export function LineBadge({ code, colour }: { code: LineCode; colour: string }) {
  return (
    <span className="line-badge" style={{ background: colour, color: contrastText(colour) }}>
      {code}
    </span>
  );
}
