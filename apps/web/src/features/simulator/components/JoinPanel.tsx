import { useState } from "react";
import { PLAYER_ROLES, type PlayerRole } from "@raid-simulator/shared";

type JoinPanelProps = {
  connectionStatus: string;
  errorMessage: string | null;
  onJoin: (name: string, role: PlayerRole) => Promise<void>;
  onScenarioStart: () => void;
};

export function JoinPanel({ connectionStatus, errorMessage, onJoin, onScenarioStart }: JoinPanelProps) {
  const [role, setRole] = useState<PlayerRole | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const isConnecting = connectionStatus === "connecting";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);

    if (!role) {
      setLocalError("역할을 선택해주세요.");
      return;
    }

    await onJoin("", role);
  }

  return (
    <form className="join-panel" onSubmit={handleSubmit}>
      <h1>Raid Simulator MVP</h1>
      <p>역할을 고르면 같은 아레나에 접속해 위치를 동기화합니다.</p>

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

      <button className="join-button" type="submit" disabled={isConnecting}>
        {isConnecting ? "Joining..." : "Join Room"}
      </button>

      <button className="guide-button" type="button" onClick={onScenarioStart} disabled={isConnecting}>
        시작
      </button>

      {(localError || errorMessage) && <div className="error-message">{localError ?? errorMessage}</div>}
    </form>
  );
}
