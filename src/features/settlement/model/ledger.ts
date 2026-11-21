import type { Shift } from "../../../shared/types";
import { copyShift } from "../../../shared/document";
import { analyzeFlightDelay } from "./analyze";

/**
 * Accrue overrun time for every flight that is on the ground, over the
 * half-open span [from, to).  This is the only place delay seconds are
 * created, and `settlement.from` is a high-water mark, so changing speed,
 * pausing, or loading a saved shift cannot overlap or double-count time.
 *
 * Consecutive ticks with an unchanged cause/detail/reducibility extend the
 * last interval instead of appending a new one.  Different causes always start
 * a new interval, which is what lets the UI drill from a flight into the exact
 * time range behind each cause.
 */
export function accrueDelay(state: Shift, from: number, to: number): Shift {
  const s = copyShift(state),
    ledger = s.settlement;
  const start = Math.max(from, ledger.from);
  if (!(to > start)) return s;
  for (const flight of s.flights) {
    if (flight.departureAt !== undefined) continue;
    if (flight.status !== "incoming" && flight.status !== "parked") continue;
    // No overrun can accrue before the aircraft is on the ground or before its
    // planned departure time, whichever is later.  Clipping at arrival keeps a
    // coarse tick that straddles the arrival instant from over-counting.
    const overrunStart = Math.max(start, flight.deadline, flight.arrival);
    if (overrunStart >= to) continue;
    const analysis = analyzeFlightDelay(s, flight);
    if (!analysis) continue;
    const intervals = ledger.intervals;
    let open: (typeof intervals)[number] | undefined;
    for (let i = intervals.length - 1; i >= 0; i--) {
      if (intervals[i].flightId === flight.id) {
        open = intervals[i];
        break;
      }
    }
    if (
      open &&
      !open.final &&
      Math.abs(open.end - overrunStart) < 1e-9 &&
      open.cause === analysis.cause &&
      open.reducible === analysis.reducible &&
      open.detail === analysis.detail
    ) {
      open.end = to;
      continue;
    }
    intervals.push({
      id: ledger.nextIntervalId++,
      flightId: flight.id,
      start: overrunStart,
      end: to,
      cause: analysis.cause,
      detail: analysis.detail,
      blockers: analysis.blockers.map((b) => ({ ...b })),
      reducible: analysis.reducible,
      final: false,
    });
  }
  ledger.from = to;
  return s;
}

/**
 * Freeze every interval of a flight once its departure time is fixed.  This is
 * append-only: later ticks cannot create more intervals for the flight, and no
 * command (including recalling an unexecuted one) rewrites the past.
 */
export function freezeFlight(state: Shift, flightId: string): Shift {
  for (const interval of state.settlement.intervals) {
    if (interval.flightId === flightId) interval.final = true;
  }
  return state;
}
