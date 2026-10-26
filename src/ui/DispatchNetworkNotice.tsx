import type { LineCode } from '../data/types';
import type { NetworkIndex } from '../engine/network';
import { LineBadge } from './LineBadge';

/** Stays in the typing panel until the next Shift starts. */
export function DispatchNetworkNotice({ net, line }: { net: NetworkIndex; line: LineCode }) {
  const joined = net.lines.get(line)!;
  return (
    <div className="dispatch-network-notice" role="status" aria-label="New Line">
      <LineBadge code={line} colour={joined.colour} />
      <span>{joined.name} joins the network</span>
    </div>
  );
}
