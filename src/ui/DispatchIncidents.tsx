import type { NetworkIndex } from '../engine/network';
import type { CareerState } from '../engine/dispatch';
import { INCIDENT_LIMIT_MS } from '../engine/dispatchBalance';
import { fixItems } from '../engine/dispatchIncidents';
import type { IncidentKind } from '../engine/dispatchSim';
import { LineBadge } from './LineBadge';

export const INCIDENT_KIND_NAME: Record<IncidentKind, string> = {
  'signal-fault': 'Signal fault',
  'train-fault': 'Train fault',
  'crowd-surge': 'Crowd surge',
};

/**
 * The active Incidents as cards: kind, Line, place, what to type to fix it,
 * and a bar that fills as the place nears going Out of service.
 */
export function DispatchIncidents({ net, career }: { net: NetworkIndex; career: CareerState }) {
  const { sim } = career;
  const incidents = sim.incidents.filter((inc) => !sim.outOfService[inc.place]);
  if (incidents.length === 0) return <p className="hint dispatch-calm">No Incidents</p>;
  return (
    <ul className="dispatch-incidents" aria-label="Incidents">
      {incidents.map((inc) => {
        const place = net.stations.get(inc.place)?.name ?? inc.place;
        const line = net.lines.get(inc.line);
        const items = fixItems(net, inc, sim);
        const worse = Math.max(0, Math.min(1, (sim.shiftMs - inc.startedMs) / INCIDENT_LIMIT_MS));
        const pct = Math.round(worse * 100);
        return (
          <li key={inc.id} className="dispatch-incident-card" data-kind={inc.kind}>
            <p className="dispatch-incident-head">
              <svg className="dispatch-incident-icon" viewBox="-1 -1 2 2" aria-hidden="true">
                <path d="M0,-0.9 L0.85,0.7 L-0.85,0.7 Z" />
              </svg>
              <strong>{INCIDENT_KIND_NAME[inc.kind]}</strong>
              {line && <LineBadge code={line.code} colour={line.colour} />}
              <span>{place}</span>
            </p>
            <p className="dispatch-fix-items">
              <span className="dispatch-fix-label">Type</span>
              {items.map((text, i) => (
                <span key={i} data-state={i < inc.step ? 'done' : i === inc.step ? 'current' : 'pending'}>
                  {text}
                </span>
              ))}
            </p>
            <div
              className="dispatch-timer"
              role="progressbar"
              aria-label={`Time until ${place} goes out of service`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              data-critical={worse >= 0.5 ? 'true' : undefined}
            >
              <span style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
