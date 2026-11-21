import type { Shift, ServiceKind } from "../../../shared/types";
import { copyShift, record } from "../../../shared/document";
import { serviceCatalog } from "./catalog";
import { accrueDelay } from "../../settlement";

/**
 * Recall an order that has not started work yet (vehicle still en route).
 *
 * The elapsed wait is accrued *before* the state changes, and the ledger is
 * append-only, so recalling the order frees the vehicle for the future without
 * erasing a single second that has already been lost.  Work that has already
 * begun (`working`) or finished (`done`) cannot be recalled at all.
 */
export function recallService(
  state: Shift,
  flightId: string,
  kind: ServiceKind,
): Shift {
  const settled = accrueDelay(state, state.settlement.from, state.time);
  const s = copyShift(settled),
    task = s.services.find((t) => t.flightId === flightId && t.kind === kind);
  if (!task || task.status !== "travel") return state;
  const vehicle = s.vehicles.find((v) => v.id === task.vehicleId);
  if (vehicle) {
    vehicle.status = "returning";
    vehicle.origin = { ...vehicle.position };
    vehicle.target = { x: 830, y: 480 };
    vehicle.progress = 0;
    vehicle.tripDuration = 10;
    vehicle.serviceId = undefined;
  }
  task.status = "pending";
  task.progress = 0;
  task.vehicleId = undefined;
  record(
    s,
    `${flightId} ${serviceCatalog[kind].label}指令已撤回 · 已发生的等待计入结算`,
    "warning",
  );
  return s;
}
