import { useState } from "react";
import { PLAYER_ROLES, type PlayerRole } from "@raid-simulator/shared";

type ConnectionOverlayProps = {
  name: string;
  role: PlayerRole | null;
  roomId?: string | null;
  controlsLocked?: boolean;
  remainingSec?: number | null;
  canChangeRole?: boolean;
  occupiedRoles?: PlayerRole[];
  onChangeRole?: (role: PlayerRole) => void;
  sessionId: string | null;
  playerCount: number;
  status: string;
  onLeave: () => void;
};

function formatTime(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

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
  roomId = null,
  controlsLocked = false,
  remainingSec = null,
  canChangeRole = false,
  occupiedRoles = [],
  onChangeRole,
  sessionId,
  playerCount,
  status,
  onLeave
}: ConnectionOverlayProps) {
  const [copied, setCopied] = useState(false);

  async function copyInvite() {
    if (!roomId) return;
    const link = `${window.location.origin}/?room=${roomId}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // 클립보드 권한이 없으면 무시(코드 텍스트는 화면에 노출됨).
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

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
            {remainingSec != null && (
              <span className={`room-timer${remainingSec <= 60 ? " is-low" : ""}`}> · 남은 {formatTime(remainingSec)}</span>
            )}
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

      {roomId && (
        <div className="invite-row">
          <span className="invite-label">방 코드</span>
          <code className="invite-code">{roomId}</code>
          <button className="invite-copy" type="button" onClick={copyInvite}>
            {copied ? "복사됨!" : "초대 링크 복사"}
          </button>
        </div>
      )}

      {canChangeRole && onChangeRole && (
        <div className="role-change-row">
          <span className="role-change-label">역할 변경</span>
          <select
            className="role-change-select"
            value={role ?? ""}
            onChange={(event) => onChangeRole(event.target.value as PlayerRole)}
          >
            {PLAYER_ROLES.map((r) => (
              <option key={r} value={r} disabled={r !== role && occupiedRoles.includes(r)}>
                {r} · {ROLE_GROUP[r]}
                {r !== role && occupiedRoles.includes(r) ? " (사용중)" : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {controlsLocked && <div className="overlay-locked">기믹 실패로 중단됨 — 컨트롤 정지 (중단/재시작 시 해제)</div>}
      <div className="overlay-help">WASD 이동 · 우클릭 드래그 회전 · 휠 줌</div>
    </section>
  );
}
