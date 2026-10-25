import type { NetworkIndex } from '../engine/network';
import type { CareerState } from '../engine/dispatch';
import { INCIDENT_LIMIT_MS } from '../engine/dispatchBalance';
import { fixItems } from '../engine/dispatchIncidents';
import { crowdAt, type Incident, type IncidentKind } from '../engine/dispatchSim';
import { INCIDENT_GLYPH } from '../render/incidentGlyphs';
import type { Closing } from '../render/useClosures';
import { LineBadge } from './LineBadge';

export const INCIDENT_KIND_NAME: Record<IncidentKind, string> = {
  'signal-fault': 'Signal fault',
  'train-fault': 'Train fault',
  'crowd-surge': 'Crowd surge',
};

/**
 * The active Incidents as cards: kind, Line, place, what to type to fix it,
 * and a bar that fills as the place nears going Out of service. A Crowd
 * surge's card also counts who is waiting at its place. An Incident whose
 * place just closed keeps its card a moment longer, marked Out of service,
 * where it was in the list.
 */
export function DispatchIncidents({
  net, career, closing = [],
}: { net: NetworkIndex; career: CareerState; closing?: readonly Closing[] }) {
  const { sim } = career;
  const active = sim.incidents.filter((inc) => !sim.outOfService[inc.place]);
  const closed = new Set<Incident>();
  for (const c of closing) if (c.incident) closed.add(c.incident);
  const cards = [...active, ...closed].sort((a, b) => a.id - b.id);
  if (cards.length === 0) return <p className="hint dispatch-calm">No Incidents</p>;
  return (
    <ul className="dispatch-incidents" aria-label="Incidents">
      {cards.map((inc) => {
        const isClosed = closed.has(inc);
        const place = net.stations.get(inc.place)?.name ?? inc.place;
        const line = net.lines.get(inc.line);
        const worse = isClosed ? 1 : Math.max(0, Math.min(1, (sim.shiftMs - inc.startedMs) / INCIDENT_LIMIT_MS));
        const pct = Math.round(worse * 100);
        return (
          <li key={inc.id} className="dispatch-incident-card" data-kind={inc.kind}
            data-closed={isClosed ? 'true' : undefined}>
            <p className="dispatch-incident-head">
              <svg className="dispatch-incident-icon" viewBox="-1 -1 2 2" aria-hidden="true">
                <path data-icon={`incident-${inc.kind}`} d={INCIDENT_GLYPH[inc.kind]} fillRule="evenodd" />
              </svg>
              <strong>{INCIDENT_KIND_NAME[inc.kind]}</strong>
              {line && <LineBadge code={line.code} colour={line.colour} />}
              <span className="dispatch-incident-place">{place}</span>
            </p>
            {isClosed ? (
              <p className="dispatch-closed-note">Out of service</p>
            ) : (
              <>
                {inc.kind === 'crowd-surge' && (
                  <p className="dispatch-crowd" data-testid="crowd-count">{crowdAt(sim, inc.place)} waiting</p>
                )}
                <p className="dispatch-fix-items">
                  <span className="dispatch-fix-label">Type</span>
                  {fixItems(net, inc, sim).map((text, i) => (
                    <span key={i} data-state={i < inc.step ? 'done' : i === inc.step ? 'current' : 'pending'}>
                      {text}
                    </span>
                  ))}
                </p>
              </>
            )}
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
