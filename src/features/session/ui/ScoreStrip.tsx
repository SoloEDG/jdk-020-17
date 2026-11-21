import type { Shift } from "../../../shared/types";
import { formatSeconds, settlementReport } from "../../settlement/lib/report";
export function ScoreStrip({ state }: { state: Shift }) {
  const report = settlementReport(state),
    departed = state.flights.filter((f) => f.status === "departed").length,
    late = report.flights.filter((f) => f.delay > 0).length;
  return (
    <div className="score-strip">
      <div>
        <span className="stat-icon orange">↗</span>
        <p>
          本班得分
          <strong>
            {state.score}
            <small>PTS</small>
          </strong>
        </p>
      </div>
      <div>
        <span className="stat-icon">✈</span>
        <p>
          已完成离港
          <strong>
            {String(departed).padStart(2, "0")}
            <small>/ 06</small>
          </strong>
        </p>
      </div>
      <div>
        <span className="stat-icon">◷</span>
        <p>
          累计延误
          <strong>
            {formatSeconds(report.totalDelay)}
            <small>{late} LATE</small>
          </strong>
        </p>
      </div>
      <div>
        <span className="stat-icon">◇</span>
        <p>
          指令冲突
          <strong>
            {String(state.conflicts).padStart(2, "0")}
            <small>EVENTS</small>
          </strong>
        </p>
      </div>
      <div className="objective">
        <span>SHIFT OBJECTIVE</span>
        <strong>
          {departed === 6
            ? "班次完成 · 辛苦了！"
            : "让每一次起飞，都准时发生。"}
        </strong>
        <div>
          <i style={{ width: `${(departed / 6) * 100}%` }} />
        </div>
      </div>
    </div>
  );
}
