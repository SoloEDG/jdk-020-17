import type { Shift } from "../../../shared/types";
import { copyShift, record } from "../../../shared/document";
import { accrueDelay } from "../../settlement";
export function advanceClock(state: Shift, seconds: number): Shift {
  if (state.paused) return state;
  const elapsed = Math.max(0, seconds);
  const from = state.time;
  const s = copyShift(state);
  s.time = from + elapsed;
  // Flight status changes first, so the whole [from, time) window is analysed
  // against the state that was actually observable for the part of the window
  // after the change.  accrueDelay clips each flight at its own arrival time.
  for (const f of s.flights) {
    if (f.status === "scheduled" && s.time >= f.arrival) {
      f.status = "incoming";
      record(s, `${f.id} 已进入进港队列`);
    }
  }
  const accrued = accrueDelay(s, from, s.time);
  for (const f of accrued.flights) {
    if (
      f.status === "departing" &&
      accrued.time - (f.departureAt ?? accrued.time) >= 12
    ) {
      f.status = "departed";
      record(accrued, `${f.id} 已离港，机位 ${f.standId} 释放`, "success");
    }
  }
  return accrued;
}
export function togglePause(s: Shift): Shift {
  return { ...s, paused: !s.paused };
}
export function changeSpeed(s: Shift): Shift {
  return { ...s, speed: s.speed === 1 ? 2 : s.speed === 2 ? 4 : 1 };
}
