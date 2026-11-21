import { useState } from "react";
import type { Shift } from "../../../shared/types";
import { clockLabel } from "../../../shared/document";
import {
  causeMeta,
  causeRows,
  formatSeconds,
  settlementReport,
} from "..";
import type { FlightSettlement } from "..";

const causeGlyph: Record<string, string> = {
  stand: "◫",
  vehicle: "▰",
  service: "◇",
  player: "◷",
};

function CauseBar({
  rows,
  total,
  live,
}: {
  rows: ReturnType<typeof causeRows>;
  total: number;
  live: boolean;
}) {
  if (total <= 0) {
    return <div className="cause-bar cause-bar-empty">暂无可归因的延误</div>;
  }
  return (
    <div
      className={`cause-bar ${live ? "live" : ""}`}
      role="img"
      aria-label={live ? "实际等待时间构成（暂估）" : "实际等待时间构成（已固定）"}
      title={`${live ? "暂估" : "已固定"}等待合计 ${formatSeconds(total)}`}
    >
      {rows.map((row) => (
        <i
          key={row.cause}
          style={{
            width: `${(row.seconds / total) * 100}%`,
            background: row.color,
          }}
          title={`${row.label} ${formatSeconds(row.seconds)}`}
        />
      ))}
    </div>
  );
}

function CauseTable({
  rows,
  total,
  estimate,
}: {
  rows: ReturnType<typeof causeRows>;
  total: number;
  estimate: boolean;
}) {
  if (rows.length === 0) {
    return <p className="settle-empty">没有产生延误。</p>;
  }
  return (
    <table className="cause-table">
      <thead>
        <tr>
          <th>原因</th>
          <th>{estimate ? "实际等待（暂估）" : "实际等待"}</th>
          <th>占比</th>
          <th>仅此项改善可减少</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.cause}>
            <td>
              <span
                className="cause-glyph"
                style={{ color: row.color }}
                aria-hidden="true"
              >
                {causeGlyph[row.cause]}
              </span>
              {row.label}
            </td>
            <td>{formatSeconds(row.seconds)}</td>
            <td>{total > 0 ? `${Math.round(row.share * 100)}%` : "—"}</td>
            <td
              className={
                row.reducibleSeconds > 0 ? "reducible" : "not-reducible"
              }
            >
              {row.reducibleSeconds > 0
                ? formatSeconds(row.reducibleSeconds)
                : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function IntervalList({
  flight,
  traceTime,
}: {
  flight: FlightSettlement;
  traceTime?: number;
}) {
  const [open, setOpen] = useState<string | undefined>();
  if (flight.intervals.length === 0) {
    return <p className="settle-empty">该航班没有延误区间。</p>;
  }
  return (
    <ol className="interval-list">
      {flight.intervals.map((interval) => {
        const traced =
          traceTime !== undefined &&
          traceTime >= interval.start &&
          traceTime < interval.end;
        const expanded = open === String(interval.id) || traced;
        const meta = causeMeta[interval.cause];
        return (
          <li
            key={interval.id}
            className={`${expanded ? "open" : ""} ${traced ? "traced" : ""}`}
          >
            <button
              className="interval-row"
              onClick={() => setOpen(expanded ? undefined : String(interval.id))}
              aria-expanded={expanded}
            >
              <span className="interval-cause">
                <i style={{ background: meta.color }} />
                {meta.label}
              </span>
              <span className="interval-span">
                {clockLabel(interval.start)}–{clockLabel(interval.end)}
              </span>
              <span className="interval-len">
                {formatSeconds(interval.end - interval.start)}
              </span>
              <span
                className={
                  interval.reducible ? "tag reducible" : "tag not-reducible"
                }
              >
                {interval.reducible ? "可减少" : "不可减少"}
              </span>
            </button>
            {expanded && (
              <div className="interval-detail">
                <p>{interval.detail}</p>
                <ul>
                  {interval.blockers.map((blocker, index) => (
                    <li key={`${blocker.cause}-${index}`}>
                      <b style={{ color: causeMeta[blocker.cause].color }}>
                        {causeMeta[blocker.cause].label}
                      </b>
                      {blocker.detail}
                    </li>
                  ))}
                </ul>
                <small>
                  实际口径：这 {formatSeconds(interval.end - interval.start)}{" "}
                  全部计入「{meta.label}」。
                  {interval.reducible
                    ? " 资源口径：只移除这一项等待、其余已执行指令时刻不变，该区间即可消除。"
                    : " 资源口径：即使移除这一项，仍有其他阻塞，故不标记为可减少。"}
                </small>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function FlightRow({
  flight,
  state,
  selected,
  onSelect,
}: {
  flight: FlightSettlement;
  state: Shift;
  selected: boolean;
  onSelect: () => void;
}) {
  const meta = state.flights.find((f) => f.id === flight.flightId);
  if (!meta) return null;
  const rows = causeRows(flight, flight.delay);
  // A flight still on the ground keeps adding to its last interval, so the
  // interval that contains "now" is the live one; it is marked in the list.
  const live = flight.final ? undefined : state.time;
  return (
    <div className={`settle-flight ${selected ? "selected" : ""}`}>
      <button className="settle-flight-head" onClick={onSelect}>
        <strong>{meta.id}</strong>
        <span className={`settle-badge ${flight.final ? "final" : "estimate"}`}>
          {flight.final ? "已固定" : "暂估"}
        </span>
        <span className="settle-delay">
          {flight.final ? "晚点" : "截至当前"}{" "}
          {formatSeconds(flight.delay)}
        </span>
        <span className={`settle-flight-score ${flight.score < 0 ? "loss" : ""}`}>
          {flight.score > 0 ? "+" : ""}
          {flight.score}
        </span>
      </button>
      <CauseBar rows={rows} total={flight.delay} live={!flight.final} />
      {selected && (
        <div className="settle-flight-body">
          <CauseTable rows={rows} total={flight.delay} estimate={!flight.final} />
          <IntervalList flight={flight} traceTime={live} />
        </div>
      )}
    </div>
  );
}

export function SettlementPanel({ state }: { state: Shift }) {
  const report = settlementReport(state);
  const [openFlight, setOpenFlight] = useState<string | undefined>(
    state.selectedFlightId,
  );
  const [expanded, setExpanded] = useState(false);
  const rows = causeRows(report, report.totalDelay);
  const activeFlights = report.flights.filter(
    (f) => f.delay > 0 || f.intervals.length > 0,
  );
  return (
    <section className={`settlement ${expanded ? "expanded" : ""}`}>
      <div className="settlement-head">
        <div>
          <span className="eyebrow">DELAY SETTLEMENT · 责任结算</span>
          <h2>延误去向</h2>
        </div>
        <div className="settlement-summary">
          <span className={`settle-badge ${report.final ? "final" : "estimate"}`}>
            {report.final ? "班次已固定" : "暂估中"}
          </span>
          <span className="settle-total">
            {formatSeconds(report.totalDelay)}
          </span>
          <button
            className="settle-toggle"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {expanded ? "收起明细" : "展开明细"}
          </button>
        </div>
      </div>
      <CauseBar rows={rows} total={report.totalDelay} live={!report.final} />
      <CauseTable rows={rows} total={report.totalDelay} estimate={!report.final} />
      <p className="settle-note">
        「实际等待」按航班真实状态逐秒记录，四项相加即总延误；「可减少」是资源口径：只移除该项等待、其余已执行指令时刻不变。两者分开看，不重复累计。
      </p>
      {expanded && (
        <div className="settle-body">
          <div className="settle-flights">
            {activeFlights.length === 0 ? (
              <p className="settle-empty">目前没有航班产生延误。</p>
            ) : (
              activeFlights.map((flight) => (
                <FlightRow
                  key={flight.flightId}
                  flight={flight}
                  state={state}
                  selected={
                    (openFlight ?? state.selectedFlightId) === flight.flightId
                  }
                  onSelect={() => setOpenFlight(flight.flightId)}
                />
              ))
            )}
          </div>
          <div className="settle-score">
            <h3>分数来源</h3>
            <div className="score-total">
              本班得分 <strong>{report.score}</strong>
            </div>
            <p className="score-split">
              离港奖励 {report.scoreByKind.departure > 0 ? "+" : ""}
              {report.scoreByKind.departure}
              <i />
              指令冲突 {report.scoreByKind.conflict}
            </p>
            <ul>
              {report.scoreEvents
                .slice()
                .reverse()
                .map((event) => {
                  const traceable = Boolean(
                    event.flightId &&
                      report.flights.some(
                        (f) =>
                          f.flightId === event.flightId &&
                          f.intervals.length > 0,
                      ),
                  );
                  return (
                    <li
                      key={event.id}
                      className={event.points < 0 ? "loss" : ""}
                    >
                      <span>{clockLabel(event.time)}</span>
                      {traceable ? (
                        <button
                          className="score-flight-link"
                          title="追到该航班的时间区间"
                          onClick={() => {
                            setOpenFlight(event.flightId);
                            setExpanded(true);
                          }}
                        >
                          {event.flightId}
                        </button>
                      ) : (
                        <b>{event.flightId ?? "指令"}</b>
                      )}
                      <em>{event.reason}</em>
                      <strong>
                        {event.points > 0 ? "+" : ""}
                        {event.points}
                      </strong>
                    </li>
                  );
                })}
            </ul>
            {report.scoreEvents.length === 0 && (
              <p className="settle-empty">尚无得分或扣分记录。</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
