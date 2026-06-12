import { useEffect, useState } from "react";
import { GIMMICKS, PLAYER_ROLES, type GimmickId, type PlayerRole } from "@raid-simulator/shared";

type JoinPanelProps = {
  connectionStatus: string;
  errorMessage: string | null;
  initialCode?: string;
  onCreate: (role: PlayerRole) => void;
  onJoinByCode: (code: string, role: PlayerRole) => void;
  onScenarioStart: (role: PlayerRole, gimmick: GimmickId) => void;
};

export function JoinPanel({
  connectionStatus,
  errorMessage,
  initialCode = "",
  onCreate,
  onJoinByCode,
  onScenarioStart
}: JoinPanelProps) {
  const [role, setRole] = useState<PlayerRole | null>(null);
  const [code, setCode] = useState(initialCode);
  const [scenarioGimmick, setScenarioGimmick] = useState<GimmickId>("missing");
  const [localError, setLocalError] = useState<string | null>(null);
  const isConnecting = connectionStatus === "connecting";

  useEffect(() => {
    if (initialCode) {
      setCode(initialCode);
    }
  }, [initialCode]);

  function requireRole(): PlayerRole | null {
    setLocalError(null);
    if (!role) {
      setLocalError("역할을 선택해주세요.");
      return null;
    }
    return role;
  }

  function handleCreate() {
    const picked = requireRole();
    if (picked) onCreate(picked);
  }

  function handleJoin() {
    const picked = requireRole();
    if (!picked) return;
    if (!code.trim()) {
      setLocalError("방 코드를 입력해주세요.");
      return;
    }
    onJoinByCode(code.trim(), picked);
  }

  return (
    <form className="join-panel" onSubmit={(event) => event.preventDefault()}>
      <h1>DMU simulator</h1>
      <p>역할을 고르고, 방을 만들거나 코드로 참여하세요.</p>

      <div className="role-grid" aria-label="역할 선택">
        {PLAYER_ROLES.map((playerRole) => (
          <button
            className={`role-button${role === playerRole ? " selected" : ""}`}
            key={playerRole}
            type="button"
            onClick={() => setRole(playerRole)}
            disabled={isConnecting}
          >
            {playerRole}
          </button>
        ))}
      </div>

      <label className="field-label" htmlFor="room-code">
        방 코드 (참여 시)
      </label>
      <input
        id="room-code"
        className="code-input"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        placeholder="초대 코드 입력"
        autoComplete="off"
        disabled={isConnecting}
      />

      <div className="join-actions">
        <button className="join-button" type="button" onClick={handleCreate} disabled={isConnecting}>
          {isConnecting ? "연결 중..." : "방 만들기"}
        </button>
        <button className="join-button secondary" type="button" onClick={handleJoin} disabled={isConnecting}>
          코드로 참여
        </button>
      </div>

      <label className="field-label" htmlFor="scenario-gimmick">
        동선 보기 기믹
      </label>
      <select
        id="scenario-gimmick"
        className="code-input"
        value={scenarioGimmick}
        onChange={(event) => setScenarioGimmick(event.target.value as GimmickId)}
        disabled={isConnecting}
      >
        {GIMMICKS.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>

      <button
        className="guide-button"
        type="button"
        onClick={() => {
          const picked = requireRole();
          if (picked) onScenarioStart(picked, scenarioGimmick);
        }}
        disabled={isConnecting}
      >
        동선 보기
      </button>

      {(localError || errorMessage) && <div className="error-message">{localError ?? errorMessage}</div>}
    </form>
  );
}
