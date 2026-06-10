import type { PlayerRole } from "@raid-simulator/shared";

type ConnectionOverlayProps = {
  name: string;
  role: PlayerRole | null;
  controlsLocked?: boolean;
  sessionId: string | null;
  playerCount: number;
  status: string;
  onLeave: () => void;
};

const ROLE_GROUP: Record<PlayerRole, string> = {
  MT: "탱커",
  ST: "탱커",
  H1: "힐러",
  H2: "힐러",
  D1: "근딜",
  D2: "근딜",
  D3: "원딜",
  D4: "원딜"
};

export function ConnectionOverlay({
  name,
  role,
  controlsLocked = false,
  sessionId,
  playerCount,
  status,
  onLeave
}: ConnectionOverlayProps) {
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
        {role && (
          <div className="my-role" aria-label="내 역할">
            <span className="my-role-label">내 역할</span>
            <span className="my-role-value">
              {role} · {ROLE_GROUP[role]}
            </span>
          </div>
        )}
        <button className="leave-button" type="button" onClick={onLeave}>
          Leave
        </button>
      </div>
      {controlsLocked && <div className="overlay-locked">기믹 실패로 중단됨 — 컨트롤 정지 (중단/재시작 시 해제)</div>}
      <div className="overlay-help">WASD 이동 · 우클릭 드래그 회전 · 휠 줌</div>
    </section>
  );
}
