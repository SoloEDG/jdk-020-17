import type { Shift } from "../../../shared/types";

/**
 * A signature of the observable world that invalid commands are judged
 * against.  It deliberately excludes the clock: two clicks on the same
 * rejected button while nothing else changed describe the same mistake and
 * must not be penalised twice.  When a flight parks, a vehicle frees up, a
 * stand is occupied or a service completes, the signature changes and a
 * genuinely new mistake is allowed to cost again.
 */
export function worldEpoch(s: Shift): string {
  const flights = s.flights
    .map((f) => `${f.id}:${f.status}:${f.standId ?? "-"}`)
    .join(",");
  const services = s.services.map((t) => `${t.id}:${t.status}`).join(",");
  const vehicles = s.vehicles
    .map((v) => `${v.id}:${v.status}:${v.serviceId ?? "-"}`)
    .join(",");
  return `${flights}|${services}|${vehicles}`;
}
