/**
 * Every Rush Hour tuning constant. Balancing never means touching logic.
 * All values are placeholders, sanity-checked by the scripted-typist test.
 */

/** Fixed simulation step, in milliseconds of game time. */
export const TICK_MS = 100;

/** Passengers per carriage. v1 has one carriage. */
export const CARRIAGE_CAPACITY = 4;

export const QUEUE_CAPACITY = 6;
export const INTERCHANGE_QUEUE_CAPACITY = 8;

/** Time a full Queue takes to fill its Overflow ring. */
export const OVERFLOW_MS = 20_000;
/** A Queue below Capacity drains its ring this many times faster than it fills. */
export const OVERFLOW_DRAIN_FACTOR = 2;

/** Typing is locked this long after taking a Walk link. */
export const WALK_PENALTY_MS = 5_000;

/**
 * Passengers per second across the whole Line set at multiplier 1.
 * Spread over Stations by `demand`, so a bigger Line set is harder because
 * the same passengers are further apart, not because there are more of them.
 */
export const BASE_SPAWN_PER_SECOND = 0.3;

export type DayPhaseName = 'Off-Peak' | 'Morning Peak' | 'Midday' | 'Evening Peak' | 'Late Night';

export interface DayPhaseSpec {
  name: DayPhaseName;
  ms: number;
  multiplier: number;
}

export const DAY_PHASES: readonly DayPhaseSpec[] = [
  { name: 'Off-Peak', ms: 40_000, multiplier: 0.5 },
  { name: 'Morning Peak', ms: 60_000, multiplier: 1.6 },
  { name: 'Midday', ms: 40_000, multiplier: 0.8 },
  { name: 'Evening Peak', ms: 60_000, multiplier: 1.8 },
  { name: 'Late Night', ms: 40_000, multiplier: 0.4 },
];

/** Day N multiplies the whole cycle by 1 + DAY_ESCALATION × (N − 1). */
export const DAY_ESCALATION = 0.3;

/** A Rush Hour Keylog can run far longer than the other modes'. */
export const RUSH_KEYLOG_MAX_EVENTS = 60_000;
