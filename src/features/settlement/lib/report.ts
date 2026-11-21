import type {
  DelayCause,
  DelayInterval,
  ScoreEvent,
  Shift,
} from "../../../shared/types";
import { causeMeta, delayCauseOrder } from "../model/analyze";

export interface FlightSettlement {
  flightId: string;
  /** True once the departure time is fixed; otherwise every number is an estimate. */
  final: boolean;
  /** Seconds late at the planned departure time, actual or estimated. */
  delay: number;
  /** Delay seconds attributed to each cause; the four values sum to `delay`. */
  cause: Record<DelayCause, number>;
  /**
   * Resource view: delay seconds that would disappear if this cause alone were
   * relieved with all executed commands unchanged.  Never summed with the
   * actual-accounting view.
   */
  reducible: Record<DelayCause, number>;
  intervals: DelayInterval[];
  /** Net points booked against this flight (departure reward + conflicts). */
  score: number;
  scoreEvents: ScoreEvent[];
}

export interface SettlementReport {
  final: boolean;
  totalDelay: number;
  cause: Record<DelayCause, number>;
  reducible: Record<DelayCause, number>;
  flights: FlightSettlement[];
  scoreEvents: ScoreEvent[];
  score: number;
  conflicts: number;
  /** Points split by source, so the shift total can be traced back. */
  scoreByKind: { departure: number; conflict: number };
}

function emptyCauses(): Record<DelayCause, number> {
  return { stand: 0, vehicle: 0, service: 0, player: 0 };
}

function intervalSeconds(interval: DelayInterval): number {
  return Math.max(0, interval.end - interval.start);
}

function attributedSeconds(intervals: DelayInterval[]): number {
  return intervals.reduce((sum, interval) => sum + intervalSeconds(interval), 0);
}

/**
 * Build the drill-down report: shift → flight → interval.  The actual-account
 * totals partition time so the four causes add up to the flight's delay.  The
 * reducible view uses the per-interval counterfactual flag instead and is
 * intentionally not forced to sum to the same number.
 *
 * A flight that has not arrived yet is not counted as late: its arrival time
 * is fixed, there is nothing ground control could have done, and inventing a
 * cause for it would break the "four causes add up" invariant.
 */
export function settlementReport(state: Shift): SettlementReport {
  const flights: FlightSettlement[] = state.flights.map((flight) => {
    const final =
      flight.departureAt !== undefined || flight.status === "departed";
    const intervals = state.settlement.intervals
      .filter((i) => i.flightId === flight.id)
      .sort((a, b) => a.start - b.start);
    const cause = emptyCauses(),
      reducible = emptyCauses();
    for (const interval of intervals) {
      const seconds = intervalSeconds(interval);
      cause[interval.cause] += seconds;
      if (interval.reducible) reducible[interval.cause] += seconds;
    }
    const attributed = attributedSeconds(intervals);
    // While the flight is on the ground the freeze is only an estimate, and an
    // estimate must agree with its own breakdown.  Once departure is fixed the
    // official delay (departureAt - deadline) is authoritative and, because the
    // ledger was frozen in the same command, equals the attributed total.
    const delay = final
      ? Math.max(0, Math.floor((flight.departureAt ?? 0) - flight.deadline))
      : flight.status === "scheduled"
        ? 0
        : Math.max(Math.round(attributed), 0);
    const events = state.scoreEvents.filter((e) => e.flightId === flight.id);
    return {
      flightId: flight.id,
      final,
      delay,
      cause,
      reducible,
      intervals,
      score: events.reduce((sum, e) => sum + e.points, 0),
      scoreEvents: events,
    };
  });

  const total = flights.reduce(
    (acc, f) => {
      for (const cause of delayCauseOrder) {
        acc.cause[cause] += f.cause[cause];
        acc.reducible[cause] += f.reducible[cause];
      }
      acc.totalDelay += f.delay;
      return acc;
    },
    { totalDelay: 0, cause: emptyCauses(), reducible: emptyCauses() },
  );

  const scoreByKind = state.scoreEvents.reduce(
    (acc, event) => {
      acc[event.kind] += event.points;
      return acc;
    },
    { departure: 0, conflict: 0 },
  );

  return {
    final: flights.every((f) => f.final),
    totalDelay: total.totalDelay,
    cause: total.cause,
    reducible: total.reducible,
    flights,
    scoreEvents: state.scoreEvents,
    score: state.score,
    conflicts: state.conflicts,
    scoreByKind,
  };
}

export function causeLabel(cause: DelayCause): string {
  return causeMeta[cause].label;
}

export interface CauseRow {
  cause: DelayCause;
  label: string;
  color: string;
  note: string;
  seconds: number;
  /** Share of the flight's (or shift's) actual waiting time. */
  share: number;
  reducibleSeconds: number;
}

export function causeRows(
  analysis: {
    cause: Record<DelayCause, number>;
    reducible: Record<DelayCause, number>;
  },
  totalDelay: number,
): CauseRow[] {
  return delayCauseOrder
    .map((cause) => ({
      cause,
      label: causeMeta[cause].label,
      color: causeMeta[cause].color,
      note: causeMeta[cause].note,
      seconds: Math.round(analysis.cause[cause]),
      share: totalDelay > 0 ? analysis.cause[cause] / totalDelay : 0,
      reducibleSeconds: Math.round(analysis.reducible[cause]),
    }))
    .filter((row) => row.seconds > 0 || row.reducibleSeconds > 0);
}

export function formatSeconds(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  if (minutes === 0) return `${rest}s`;
  return `${minutes}m${String(rest).padStart(2, "0")}s`;
}
