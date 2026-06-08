import type { PlayerRole } from "@raid-simulator/shared";

type ConnectionOverlayProps = {
  name: string;
  role: PlayerRole | null;
  sessionId: string | null;
  playerCount: number;
  status: string;
  onLeave: () => void;
};

export function ConnectionOverlay({ name, role, sessionId, playerCount, status, onLeave }: ConnectionOverlayProps) {
  return (
    <section className="overlay">
      <div className="overlay-row">
        <div>
          <div className="overlay-title">
            <span className="status-dot" />
            {name} {role ? `(${role})` : ""}
          </div>
          <div className="overlay-meta">
            {status} · {playerCount}/8 players · {sessionId?.slice(0, 6)}
          </div>
        </div>
        <button className="leave-button" type="button" onClick={onLeave}>
          Leave
        </button>
      </div>
      <div className="overlay-help">WASD 이동 · 우클릭 드래그 회전 · 휠 줌</div>
    </section>
  );
}
