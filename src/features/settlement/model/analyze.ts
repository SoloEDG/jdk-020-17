import type {
  DelayBlocker,
  DelayCause,
  Flight,
  Shift,
} from "../../../shared/types";
import { compatibleStand, occupiedFlight } from "../../apron/lib/geometry";
import { vehicleLabels } from "../../fleet/lib/routing";
import { serviceCatalog } from "../../services/model/catalog";

export const delayCauseOrder: DelayCause[] = [
  "stand",
  "vehicle",
  "service",
  "player",
];

export const causeMeta: Record<
  DelayCause,
  { label: string; english: string; color: string; note: string }
> = {
  stand: {
    label: "等机位",
    english: "STAND",
    color: "#c8884d",
    note: "没有可用的兼容机位",
  },
  vehicle: {
    label: "等车辆",
    english: "VEHICLE",
    color: "#4b9392",
    note: "保障任务就绪，但没有空闲的对应车辆",
  },
  service: {
    label: "保障作业",
    english: "SERVICE",
    color: "#7d8fae",
    note: "车辆在途、作业中、等待前置任务或服务位已满",
  },
  player: {
    label: "主动等待",
    english: "PLAYER",
    color: "#b05d58",
    note: "此刻已有可执行指令，但玩家没有下达",
  },
};

/**
 * Which single cause owns an interval when several blockers coexist.
 *
 * If an instruction was executable at that instant and the player did not
 * issue it, the flight was waiting on the player, not on the resource — the
 * player is the only actor who could have ended that wait immediately, so
 * 主动等待 wins over whatever else is also true.  Only when nothing is
 * dispatchable does the most upstream resource on the turnaround path decide
 * (a flight cannot be serviced before it has a stand).  This is a fixed rule,
 * never "the last check that happened to run".
 */
const causePriority: DelayCause[] = ["player", "stand", "vehicle", "service"];

export interface DelayAnalysis {
  cause: DelayCause;
  detail: string;
  blockers: DelayBlocker[];
  /**
   * Resource counterfactual: removing this single resource wait, while every
   * already-executed command keeps its timing, would leave no other blocker.
   * A second simultaneous blocker keeps this false.
   */
  reducible: boolean;
}

function pack(blockers: DelayBlocker[]): DelayAnalysis {
  const seen = new Set<string>();
  const unique = blockers.filter((b) => {
    const key = `${b.cause}|${b.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const cause =
    causePriority.find((c) => unique.some((b) => b.cause === c)) ?? "player";
  const primary = unique.find((b) => b.cause === cause) ?? {
    cause: "player" as DelayCause,
    detail: "等待下一步指令",
  };
  const detail =
    unique.length > 1
      ? `${primary.detail}（同时另有 ${unique.length - 1} 项阻塞）`
      : primary.detail;
  return {
    cause,
    detail,
    blockers: unique,
    reducible:
      (cause === "stand" || cause === "vehicle") && unique.length === 1,
  };
}

function analyzeIncoming(s: Shift, f: Flight): DelayAnalysis {
  const free = s.stands.filter(
    (stand) => compatibleStand(stand, f) && !occupiedFlight(s, stand.id),
  );
  if (free.length > 0) {
    return pack([
      {
        cause: "player",
        detail: `可分配空闲机位 ${free.map((x) => x.id).join("、")}`,
      },
    ]);
  }
  const blockers: DelayBlocker[] = [
    {
      cause: "stand",
      detail:
        f.size === "wide"
          ? "无空闲宽体机位，需等待机位释放"
          : "无空闲兼容机位，需等待机位释放",
    },
  ];
  // Counterfactual look-through: even if a stand were freed right now, the
  // flight would immediately need its vehicles.  With every executed command
  // kept at its current timing, a missing vehicle is a second blocker, so the
  // stand wait must not be advertised as independently reducible.
  for (const task of s.services.filter((t) => t.flightId === f.id)) {
    if (task.status !== "pending") continue;
    const idle = s.vehicles.some(
      (v) => v.kind === task.kind && v.status === "idle",
    );
    if (!idle) {
      blockers.push({
        cause: "vehicle",
        detail: `缺少空闲${vehicleLabels[task.kind]}`,
      });
    }
  }
  return pack(blockers);
}

function analyzeParked(s: Shift, f: Flight): DelayAnalysis {
  const tasks = s.services.filter((t) => t.flightId === f.id);
  if (tasks.every((t) => t.status === "done")) {
    return pack([
      { cause: "player", detail: "全部保障完成，可批准离港" },
    ]);
  }

  const blockers: DelayBlocker[] = [];
  const active = tasks.filter(
    (t) => t.status === "travel" || t.status === "working",
  );
  for (const task of active) {
    const label = serviceCatalog[task.kind].label;
    blockers.push({
      cause: "service",
      detail:
        task.status === "travel" ? `${label}车辆前往中` : `${label}作业中`,
    });
  }

  const done = (kind: string) =>
    tasks.some((t) => t.kind === kind && t.status === "done");

  for (const task of tasks) {
    if (task.status !== "pending") continue;
    const info = serviceCatalog[task.kind];
    // A pending task whose prerequisite is unfinished is downstream of that
    // prerequisite.  The prerequisite's own blocker is already represented,
    // so counting the dependency again would double-count the same cause.
    if (info.requires.some((kind) => !done(kind))) continue;
    if (active.length >= 2) {
      blockers.push({
        cause: "service",
        detail: `服务位已满，${info.label}等待空位`,
      });
      continue;
    }
    const idle = s.vehicles.some(
      (v) => v.kind === task.kind && v.status === "idle",
    );
    if (!idle) {
      blockers.push({
        cause: "vehicle",
        detail: `缺少空闲${vehicleLabels[task.kind]}`,
      });
    } else {
      blockers.push({
        cause: "player",
        detail: `可派遣${info.label}`,
      });
    }
  }

  if (blockers.length === 0) {
    blockers.push({ cause: "service", detail: "保障任务等待就绪" });
  }
  return pack(blockers);
}

/**
 * Observable blockers at the current instant.  Returns undefined when the
 * flight is not in a state where delay can accrue (not yet arrived, already
 * cleared for departure, or scheduled).
 */
export function analyzeFlightDelay(
  s: Shift,
  f: Flight,
): DelayAnalysis | undefined {
  if (f.departureAt !== undefined) return undefined;
  if (f.status === "incoming") return analyzeIncoming(s, f);
  if (f.status === "parked") return analyzeParked(s, f);
  return undefined;
}

export function createEmptyCauseTotals(): Record<DelayCause, number> {
  return { stand: 0, vehicle: 0, service: 0, player: 0 };
}
