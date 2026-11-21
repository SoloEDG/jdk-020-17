import type { ScoreEvent, Shift } from "../../../shared/types";
import { copyShift } from "../../../shared/document";

/**
 * Record a score change with its provenance.  Every point change goes through
 * here so the settlement can walk from the shift total back to the flight and
 * to the exact moment the points were earned or lost.
 */
export function addScoreEvent(
  state: Shift,
  event: Omit<ScoreEvent, "id">,
): Shift {
  const s = copyShift(state);
  s.score += event.points;
  s.scoreEvents.push({ ...event, id: s.nextScoreEventId++ });
  s.scoreEvents = s.scoreEvents.slice(-120);
  return s;
}

/**
 * Penalise an invalid command at most once per *observable situation*.
 *
 * The guard key is the command identity, the epoch describes the state the
 * command saw.  Clicking the same rejected button again while nothing has
 * changed neither adds a conflict nor moves responsibility; once the world
 * changes a genuinely new mistake can be penalised.  `fresh: false` means the
 * caller must not log a second event either.
 */
export function claimConflict(
  state: Shift,
  options: { key: string; epoch: string; flightId?: string },
): { state: Shift; fresh: boolean } {
  const signature = `${options.key}@${options.epoch}`;
  if (state.conflictGuards.includes(signature)) {
    return { state, fresh: false };
  }
  const s = copyShift(state);
  s.conflictGuards.push(signature);
  s.conflictGuards = s.conflictGuards.slice(-40);
  s.conflicts += 1;
  s.score -= 10;
  s.scoreEvents.push({
    id: s.nextScoreEventId++,
    time: s.time,
    flightId: options.flightId,
    kind: "conflict",
    points: -10,
    reason: "指令冲突",
  });
  s.scoreEvents = s.scoreEvents.slice(-120);
  return { state: s, fresh: true };
}

export function conflictKey(scope: string, ...parts: string[]): string {
  return [scope, ...parts].join(":");
}
