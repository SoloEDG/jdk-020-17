import type { Shift } from "../../../shared/types";
import { copyShift, record } from "../../../shared/document";
import { flightReady } from "../lib/readiness";
import {
  claimConflict,
  conflictKey,
  addScoreEvent,
  accrueDelay,
  freezeFlight,
  worldEpoch,
} from "../../settlement";

/**
 * Bring the delay ledger up to the current simulated instant before a player
 * command runs.  This guarantees the seconds spent waiting under the previous
 * state are attributed to the state that actually caused them, and that the
 * command itself can never retroactively justify the past.
 */
function settleBeforeCommand(state: Shift): Shift {
  return accrueDelay(state, state.settlement.from, state.time);
}

export function assignStand(state: Shift, id: string, standId: string): Shift {
  const before = settleBeforeCommand(state);
  const s = copyShift(before),
    f = s.flights.find((x) => x.id === id),
    stand = s.stands.find((x) => x.id === standId);
  if (!f || !stand) return state;
  const occupied = s.flights.some(
    (x) => x.standId === standId && x.status !== "departed",
  );
  if (
    f.status !== "incoming" ||
    occupied ||
    (f.size === "wide" && stand.size !== "wide")
  ) {
    const { state: penalised, fresh } = claimConflict(s, {
      // The same rejected click is one mistake; a different rejected stand is
      // a different mistake, so the stand is part of the key.
      key: conflictKey("stand", id, standId),
      epoch: worldEpoch(s),
      flightId: id,
    });
    if (!fresh) return penalised;
    record(penalised, "机位指令冲突：请检查尺寸、占用与航班状态", "warning");
    return penalised;
  }
  f.standId = standId;
  f.status = "parked";
  s.selectedStandId = standId;
  record(s, `${id} 已停靠 ${standId}，可开始保障`, "success");
  return s;
}

export function departFlight(state: Shift, id: string): Shift {
  const before = settleBeforeCommand(state);
  const s = copyShift(before),
    f = s.flights.find((x) => x.id === id);
  if (!f) return state;
  if (f.status !== "parked" || !flightReady(s, id)) {
    const { state: penalised, fresh } = claimConflict(s, {
      key: conflictKey("depart", id),
      epoch: worldEpoch(s),
      flightId: id,
    });
    if (!fresh) return penalised;
    record(penalised, "离港未获许可：请先完成全部地勤任务", "warning");
    return penalised;
  }
  f.status = "departing";
  f.departureAt = s.time;
  freezeFlight(s, id);
  const delay = Math.max(0, s.time - f.deadline);
  const points = Math.max(20, 120 - Math.floor(delay));
  const scored = addScoreEvent(s, {
    time: s.time,
    flightId: id,
    kind: "departure",
    points,
    reason:
      delay > 0
        ? `晚点 ${Math.floor(delay)}s 离港`
        : "准点离港",
  });
  record(scored, `${id} 获准推出 · +${points} 分`, "success");
  return scored;
}

export function selectFlight(state: Shift, id: string): Shift {
  return {
    ...state,
    selectedFlightId: id,
    selectedStandId: state.flights.find((f) => f.id === id)?.standId,
  };
}
