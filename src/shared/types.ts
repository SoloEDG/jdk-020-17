export type ServiceKind = "baggage" | "fuel" | "clean";
export type FlightStatus =
  "scheduled" | "incoming" | "parked" | "departing" | "departed";
export interface Point {
  x: number;
  y: number;
}
export interface Flight {
  id: string;
  airline: string;
  from: string;
  destination: string;
  aircraft: string;
  size: "narrow" | "wide";
  arrival: number;
  deadline: number;
  passengers: number;
  status: FlightStatus;
  standId?: string;
  departureAt?: number;
  color: string;
}
export interface Stand extends Point {
  id: string;
  size: "narrow" | "wide";
  terminal: string;
}
export interface Service {
  id: string;
  flightId: string;
  kind: ServiceKind;
  status: "pending" | "travel" | "working" | "done";
  progress: number;
  duration: number;
  vehicleId?: string;
}
export interface Vehicle {
  id: string;
  kind: ServiceKind;
  status: "idle" | "travel" | "working" | "returning";
  position: Point;
  origin: Point;
  target: Point;
  progress: number;
  tripDuration: number;
  serviceId?: string;
}
export interface Event {
  id: number;
  time: number;
  text: string;
  tone: "info" | "success" | "warning";
}
/**
 * Why a flight spent time past its planned departure time.
 *
 * - stand   等机位：没有可用的兼容机位，属于资源等待
 * - vehicle 等车辆：保障任务就绪，但没有空闲的对应车辆
 * - service 保障作业：正在作业、等待前置任务或服务位已满
 * - player  主动等待：当时已经存在可执行指令，但玩家没有下达
 */
export type DelayCause = "stand" | "vehicle" | "service" | "player";
export interface DelayBlocker {
  cause: DelayCause;
  detail: string;
}
/**
 * A half-open interval [start, end) of a flight's overrun, attributed to one
 * observable cause.  Intervals are append-only and never overlap, so a second
 * of delay is counted exactly once.  `reducible` is the second, deliberately
 * different view: it is true only when relieving this cause alone would have
 * removed every independent blocker in the interval.
 */
export interface DelayInterval {
  id: number;
  flightId: string;
  start: number;
  end: number;
  cause: DelayCause;
  /** Human readable labels of every independent blocker seen in the interval. */
  blockers: DelayBlocker[];
  /** Short observable fact behind the primary cause. */
  detail: string;
  reducible: boolean;
  /** Frozen when the flight is cleared for departure. */
  final: boolean;
}
export interface ScoreEvent {
  id: number;
  time: number;
  flightId?: string;
  kind: "departure" | "conflict";
  points: number;
  reason: string;
}
export interface SettlementLedger {
  /** Simulated time already covered by the ledger.  Never moves backwards. */
  from: number;
  intervals: DelayInterval[];
  nextIntervalId: number;
}
export interface Shift {
  version: 2;
  time: number;
  paused: boolean;
  speed: 1 | 2 | 4;
  score: number;
  conflicts: number;
  flights: Flight[];
  stands: Stand[];
  services: Service[];
  vehicles: Vehicle[];
  events: Event[];
  settlement: SettlementLedger;
  scoreEvents: ScoreEvent[];
  nextScoreEventId: number;
  /** Conflict signatures already penalised; repeated clicks must not re-count. */
  conflictGuards: string[];
  selectedFlightId: string;
  selectedStandId?: string;
  selectedVehicleId?: string;
  nextEventId: number;
}
export type CommandResult = (state: Shift) => Shift;
