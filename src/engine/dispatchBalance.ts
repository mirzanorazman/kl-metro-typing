/** Dispatcher starting values; balancing changes numbers here, not simulation logic. */

/** Fixed simulation step in milliseconds of game time. */
export const TICK_MS = 100;
/** Travel time over one Station-to-Station block. */
export const TRAVEL_MS = 5_000;
/** Minimum Station dwell before Passenger movement adds time. */
export const DWELL_BASE_MS = 1_500;
/** Added dwell per Passenger boarding or alighting. */
export const DWELL_PER_PASSENGER_MS = 60;
/** Time to reverse at the end of a served range. */
export const TURNAROUND_MS = 3_000;
/** Trains on a Line are max(2, round(served Stations / this)). */
export const STATIONS_PER_TRAIN = 4;
/** Maximum Passengers aboard one Train. */
export const TRAIN_CAPACITY = 100;
/** Maximum Station crowd across all directions. */
export const PLATFORM_CAPACITY = 55;
/** A full platform goes Out of service after this many milliseconds. */
export const OOS_CROWD_MS = 19_000;
/** This share of served Stations Out of service fails a Shift. */
export const OOS_FAIL_SHARE = 0.25;
/** Passengers per second per demand unit at multiplier 1. */
export const PASSENGER_RATE = 0.25;
/** Destination weight boost towards or away from the centre at peak. */
export const CENTRAL_PULL = 2;
/** Stations treated as central when weighting peak travel flows. */
export const CENTRAL_STATIONS: readonly string[] = [
  'masjid-jamek', 'klcc', 'kl-sentral', 'bukit-bintang', 'pasar-seni',
  'dang-wangi', 'kampung-baru', 'bandaraya', 'plaza-rakyat', 'hang-tuah',
  'merdeka', 'raja-chulan', 'bukit-nanas', 'tun-razak-exchange', 'persiaran-klcc',
  'conlay', 'ampang-park', 'sultan-ismail', 'medan-tuanku', 'imbi',
];

export type ShiftFlow = 'inbound' | 'outbound' | 'none';

export interface ShiftPhaseSpec {
  name: string;
  ms: number;
  multiplier: number;
  flow: ShiftFlow;
  trainFactor: number;
}

/** The compressed service day, in order, with demand and Train activity. */
export const SHIFT_PHASES: readonly ShiftPhaseSpec[] = [
  { name: 'Morning peak', ms: 35_000, multiplier: 1.6, flow: 'inbound', trainFactor: 1 },
  { name: 'Midday', ms: 20_000, multiplier: 0.7, flow: 'none', trainFactor: 0.6 },
  { name: 'Evening peak', ms: 35_000, multiplier: 1.6, flow: 'outbound', trainFactor: 1 },
];

/** Extra demand per Shift once the entire network is served. */
export const FULL_NETWORK_ESCALATION = 0.15;
/** A wrong key stalls its locked Target for this many milliseconds. */
export const WRONG_KEY_STALL_MS = 500;
/** A Train is late when platform wait exceeds this times target Headway. */
export const LATE_FACTOR = 1.5;
/** A Station call is on time up to this times target Headway. */
export const ON_TIME_FACTOR = 1.25;
/** Incident arrivals per minute at demand multiplier 1. */
export const INCIDENTS_PER_MINUTE = 2;
/** Maximum simultaneous Incidents. */
export const INCIDENT_MAX = 3;
/** No Incident can start before this time in a Shift. */
export const INCIDENT_FIRST_MS = 4_000;
/** Unfixed Incidents put their place Out of service after this long. */
export const INCIDENT_LIMIT_MS = 17_000;
/** Passenger arrival multiplier at a crowd surge's place. */
export const CROWD_SURGE_MULTIPLIER = 4;
/** Crowding contribution when weighting Incident locations. */
export const STRAIN_CROWD_WEIGHT = 4;
/** Held Train contribution when weighting Incident locations. */
export const STRAIN_HELD_WEIGHT = 2;
/** Number of Stations affected by a signal fault. */
export const SIGNAL_FAULT_STATIONS = 3;
/** First Station ahead considered for Skip-stop. */
export const SKIP_MIN_AHEAD = 2;
/** Furthest Station ahead considered for Skip-stop. */
export const SKIP_MAX_AHEAD = 3;
/** Trains on the same Line and direction this many blocks apart are bunched. */
export const BUNCH_BLOCKS = 1;
/** A bunched pair that stays together this long starts a Service gap on its rear Train. */
export const GAP_TRIGGER_MS = 16_000;
/** A fixed Service gap holds the rear Train at its Signal this long. */
export const GAP_HOLD_MS = 6_000;
/** A Green wave fires each time the clean streak reaches a multiple of this. */
export const COMBO_EVERY = 3;
/** Most waiting Signals one Green wave clears. */
export const COMBO_MAX_WAVE = 4;
/** Maximum Expansion choices after a Cleared Shift. */
export const EXPANSION_OFFERS = 3;
/** Minimum Expansion size, including the anchor when starting a Line. */
export const EXPANSION_MIN_STATIONS = 2;
/** Maximum Expansion size, including the anchor when starting a Line. */
export const EXPANSION_MAX_STATIONS = 5;
/** Cleared Shifts required to advance one Era. */
export const SHIFTS_PER_ERA = 3;
/**
 * Maximum recorded keystrokes over a Dispatcher Career: over five hours at
 * 120 WPM. A Career that reaches it truncates and can never be verified, so it
 * sits far past any honest session (final review: 60,000 was reached at ~108 min).
 */
export const DISPATCH_KEYLOG_MAX_EVENTS = 200_000;
