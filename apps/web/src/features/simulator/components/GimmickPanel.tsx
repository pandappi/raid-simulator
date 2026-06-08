import { useSimulatorStore } from "../stores/simulatorStore";

type GimmickPanelProps = {
  onControl: (action: "start" | "fillStart" | "stop" | "restart", gimmick?: string) => void;
};

// 현재는 "행방불명" 한 종류. 추후 추가되면 목록에 넣는다.
const GIMMICKS = [{ id: "missing", name: "행방불명" }];

const PHASE_LABEL: Record<string, string> = {
  idle: "대기",
  running: "진행 중",
  success: "성공",
  failed: "실패 포함"
};

export function GimmickPanel({ onControl }: GimmickPanelProps) {
  const gimmick = useSimulatorStore((state) => state.gimmick);
  const selected = GIMMICKS[0]?.id ?? "missing";
  const running = gimmick.phase === "running";

  return (
    <div className="gimmick-panel">
      <div className="gimmick-row">
        <select className="gimmick-select" value={selected} disabled onChange={() => undefined}>
          {GIMMICKS.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <span className={`gimmick-status gimmick-status--${gimmick.phase}`}>
          {PHASE_LABEL[gimmick.phase] ?? gimmick.phase}
          {gimmick.round > 0 ? ` · ${gimmick.round}번 탑` : ""}
        </span>
      </div>

      <div className="gimmick-row">
        <button className="gimmick-button start" onClick={() => onControl("start", selected)} disabled={running}>
          시작
        </button>
        <button className="gimmick-button fill-start" onClick={() => onControl("fillStart", selected)} disabled={running}>
          봇 보충 시작
        </button>
        <button className="gimmick-button stop" onClick={() => onControl("stop")} disabled={gimmick.phase === "idle"}>
          중지
        </button>
        <button className="gimmick-button restart" onClick={() => onControl("restart", selected)}>
          재시작
        </button>
      </div>

      <div className="gimmick-logs">
        {gimmick.logs.length === 0 ? (
          <div className="gimmick-log-empty">로그 없음 — 시작을 눌러보세요.</div>
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
