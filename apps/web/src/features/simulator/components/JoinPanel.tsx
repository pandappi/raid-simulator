import { useState } from "react";
import { PLAYER_ROLES, type PlayerRole } from "@raid-simulator/shared";

type JoinPanelProps = {
  connectionStatus: string;
  errorMessage: string | null;
  onJoin: (name: string, role: PlayerRole) => Promise<void>;
};

export function JoinPanel({ connectionStatus, errorMessage, onJoin }: JoinPanelProps) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<PlayerRole | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const isConnecting = connectionStatus === "connecting";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setLocalError("이름을 입력해주세요.");
      return;
    }

    if (!role) {
      setLocalError("역할을 선택해주세요.");
      return;
    }

    await onJoin(trimmedName, role);
  }

  return (
    <form className="join-panel" onSubmit={handleSubmit}>
      <h1>Raid Simulator MVP</h1>
      <p>8인 Room에 접속해 역할을 고르고 같은 아레나에서 위치를 동기화합니다.</p>

      <label className="field-label" htmlFor="player-name">
        이름
      </label>
      <input
        id="player-name"
        className="name-input"
        value={name}
        maxLength={20}
        onChange={(event) => setName(event.target.value)}
        placeholder="Alice"
        disabled={isConnecting}
      />

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

      {(localError || errorMessage) && <div className="error-message">{localError ?? errorMessage}</div>}
    </form>
  );
}
