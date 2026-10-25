export type ClosureBand = 'calm' | 'warn' | 'danger';

/** calm below 0.4 of the slots filled, warn from 0.4, danger from 0.75. */
export function closureBand(closed: number, slots: number): ClosureBand {
  const share = slots > 0 ? closed / slots : 1;
  return share >= 0.75 ? 'danger' : share >= 0.4 ? 'warn' : 'calm';
}

/**
 * How near the Shift is to failing: one slot per closure it can take, the
 * first `closed` filled, the last one drawn as the failure line. Nothing until
 * the first closure. `fresh` pops the newest filled slot.
 */
export function ClosureGauge({ closed, slots, fresh }: { closed: number; slots: number; fresh: boolean }) {
  if (closed <= 0) return null;
  // Several closures can land on the failing tick: never more filled than slots.
  const shown = Math.min(closed, slots);
  const band = closureBand(shown, slots);
  return (
    <div className="closure-gauge" data-band={band}>
      <span className="closure-label">Closed</span>
      <span
        className="closure-track"
        role="progressbar"
        aria-label="Stations closed"
        aria-valuemin={0}
        aria-valuemax={slots}
        aria-valuenow={shown}
        data-band={band}
      >
        {Array.from({ length: slots }, (_, i) => (
          <span
            key={i}
            className="closure-slot"
            data-slot=""
            data-filled={i < shown ? 'true' : undefined}
            data-line={i === slots - 1 ? 'true' : undefined}
            data-fresh={fresh && i === shown - 1 ? 'true' : undefined}
          />
        ))}
      </span>
      <span className="closure-count">{shown} / {slots}</span>
    </div>
  );
}
