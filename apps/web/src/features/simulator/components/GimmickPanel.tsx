import { useState } from "react";
import { GIMMICKS, type GimmickId } from "@raid-simulator/shared";
import { useSimulatorStore } from "../stores/simulatorStore";

type GimmickPanelProps = {
  onControl: (
    action: "practiceStart" | "stop" | "pause" | "resume",
    gimmick?: string,
    options?: { stopOnFailure?: boolean }
  ) => void;
};

const PHASE_LABEL: Record<string, string> = {
  idle: "대기",
  running: "진행 중",
  success: "성공",
  failed: "실패 포함"
};

export function GimmickPanel({ onControl }: GimmickPanelProps) {
  const [stopOnFailure, setStopOnFailure] = useState(true);
  const [selected, setSelected] = useState<GimmickId>("missing");
  const gimmick = useSimulatorStore((state) => state.gimmick);
  const running = gimmick.phase === "running";
  const paused = gimmick.paused;
  const liveSupported = GIMMICKS.find((g) => g.id === selected)?.liveSupported ?? false;

  return (
    <div className="gimmick-panel">
      <div className="gimmick-row">
        <select
          className="gimmick-select"
          value={selected}
          onChange={(event) => setSelected(event.target.value as GimmickId)}
          disabled={running}
        >
          {GIMMICKS.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <span className={`gimmick-status gimmick-status--${gimmick.phase}`}>
          {PHASE_LABEL[gimmick.phase] ?? gimmick.phase}
          {gimmick.round > 0 ? ` · ${gimmick.round}번 탑` : ""}
          {paused ? " · 일시정지" : ""}
        </span>
      </div>

      <label className="gimmick-option">
        <input type="checkbox" checked={stopOnFailure} onChange={(event) => setStopOnFailure(event.target.checked)} />
        실패시 중단
      </label>

      <div className="gimmick-row">
        <button
          className="gimmick-button start"
          onClick={() => onControl("practiceStart", selected, { stopOnFailure })}
          disabled={running || !liveSupported}
        >
          시작
        </button>
        <button className="gimmick-button pause" onClick={() => onControl(paused ? "resume" : "pause")} disabled={!running}>
          {paused ? "재개" : "일시정지"}
        </button>
        <button className="gimmick-button stop" onClick={() => onControl("stop")} disabled={gimmick.phase === "idle"}>
          중단
        </button>
      </div>

      <div className="gimmick-logs">
        {gimmick.logs.length === 0 ? (
          <div className="gimmick-log-empty">로그 없음 - 시작을 눌러보세요.</div>
        ) : (
          gimmick.logs
            .slice(-12)
            .reverse()
            .map((line, index) => (
              <div key={`${index}-${line}`} className={`gimmick-log${line.includes("실패") ? " is-fail" : ""}`}>
                {line}
              </div>
            ))
        )}
      </div>
    </div>
  );
}
