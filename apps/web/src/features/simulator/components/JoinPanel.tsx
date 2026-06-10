import { useEffect, useState } from "react";
import { PLAYER_ROLES, type PlayerRole } from "@raid-simulator/shared";

type JoinPanelProps = {
  connectionStatus: string;
  errorMessage: string | null;
  occupiedRoles: PlayerRole[];
  simulationRunning?: boolean;
  onJoin: (name: string, role: PlayerRole) => Promise<void>;
  onScenarioStart: (role: PlayerRole) => void;
};

export function JoinPanel({
  connectionStatus,
  errorMessage,
  occupiedRoles,
  simulationRunning = false,
  onJoin,
  onScenarioStart
}: JoinPanelProps) {
  const [role, setRole] = useState<PlayerRole | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const isConnecting = connectionStatus === "connecting";

  useEffect(() => {
    if (role && occupiedRoles.includes(role)) {
      setRole(null);
    }
  }, [occupiedRoles, role]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);

    if (simulationRunning) {
      setLocalError("시뮬레이션 진행 중에는 입장할 수 없습니다. 중단 후 다시 시도해주세요.");
      return;
    }
    if (!role) {
      setLocalError("역할을 선택해주세요.");
      return;
    }
    if (occupiedRoles.includes(role)) {
      setLocalError("이미 접속중인 역할입니다.");
      return;
    }

    await onJoin("", role);
  }

  return (
    <form className="join-panel" onSubmit={handleSubmit}>
      <h1>DMU simulator</h1>
      <p>역할을 골라서 참여해주세요.</p>

      {simulationRunning && (
        <div className="join-blocked">시뮬레이션 진행 중 — 중단되면 입장할 수 있어요. (공략 보기는 가능)</div>
      )}

      <div className="role-grid" aria-label="역할 선택">
        {PLAYER_ROLES.map((playerRole) => {
          const occupied = occupiedRoles.includes(playerRole);
          return (
            <button
              className={`role-button${role === playerRole ? " selected" : ""}${occupied ? " occupied" : ""}`}
              key={playerRole}
              type="button"
              onClick={() => setRole(playerRole)}
              disabled={isConnecting || occupied}
              title={occupied ? "이미 접속중인 역할" : undefined}
            >
              {playerRole}
            </button>
          );
        })}
      </div>

      <button className="join-button" type="submit" disabled={isConnecting || simulationRunning}>
        {isConnecting ? "참여 중..." : simulationRunning ? "진행 중 — 입장 불가" : "참여하기"}
      </button>

      <button
        className="guide-button"
        type="button"
        onClick={() => {
          setLocalError(null);
          if (!role) {
            setLocalError("역할을 선택해주세요.");
            return;
          }
          onScenarioStart(role);
        }}
        disabled={isConnecting}
      >
        공략 보기
      </button>

      {(localError || errorMessage) && <div className="error-message">{localError ?? errorMessage}</div>}
    </form>
  );
}
