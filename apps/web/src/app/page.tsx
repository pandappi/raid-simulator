"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { PlayerRole } from "@raid-simulator/shared";
import { JoinPanel } from "@/features/simulator/components/JoinPanel";
import { ConnectionOverlay } from "@/features/simulator/components/ConnectionOverlay";
import { GimmickPanel } from "@/features/simulator/components/GimmickPanel";
import { useKeyboardInput } from "@/features/simulator/hooks/useKeyboardInput";
import { usePrediction } from "@/features/simulator/hooks/usePrediction";
import { useRaidRoom } from "@/features/simulator/hooks/useRaidRoom";
import { useScenarioPlayback } from "@/features/simulator/hooks/useScenarioPlayback";
import { useSimulatorStore } from "@/features/simulator/stores/simulatorStore";

const SimulatorCanvas = dynamic(
  () => import("@/features/simulator/components/SimulatorCanvas").then((module) => module.SimulatorCanvas),
  { ssr: false }
);
const PHASE_LABEL: Record<string, string> = {
  idle: "대기",
  running: "진행 중",
  success: "성공",
  failed: "실패 포함"
};

export default function Home() {
  const { createRoom, joinRoom, setRole, leave, sendInput, sendGimmick } = useRaidRoom();
  const connectionStatus = useSimulatorStore((state) => state.connectionStatus);
  const errorMessage = useSimulatorStore((state) => state.errorMessage);
  const sessionId = useSimulatorStore((state) => state.sessionId);
  const roomId = useSimulatorStore((state) => state.roomId);
  const selfName = useSimulatorStore((state) => state.selfName);
  const selfRole = useSimulatorStore((state) => state.selfRole);
  const players = useSimulatorStore((state) => state.players);
  const gimmick = useSimulatorStore((state) => state.gimmick);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [scenarioMode, setScenarioMode] = useState(false);
  const [scenarioPaused, setScenarioPaused] = useState(false);
  const [scenarioFocusRole, setScenarioFocusRole] = useState<PlayerRole | null>(null);
  const [initialCode, setInitialCode] = useState("");

  const isConnected = connectionStatus === "connected";
  const isInSimulator = isConnected || scenarioMode;
  const playerCount = useMemo(() => Object.keys(players).length, [players]);
  const controlsLocked = gimmick.controlsLocked;
  const gimmickRunning = gimmick.phase === "running";
  // 시뮬 내 역할 변경 시 다른 참가자가 점유한 역할(자기 제외).
  const occupiedByOthers = useMemo(
    () => Object.values(players).filter((p) => p.id !== sessionId).map((p) => p.role),
    [players, sessionId]
  );

  useScenarioPlayback(scenarioMode, scenarioPaused, scenarioFocusRole);
  useKeyboardInput({ enabled: isConnected && !scenarioMode && !controlsLocked });
  usePrediction({ enabled: isConnected && !scenarioMode && !controlsLocked, sendInput });

  // 초대 링크(?room=코드)로 들어오면 코드를 미리 채운다.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("room");
    if (code) {
      setInitialCode(code.trim());
    }
  }, []);

  async function handleCreate(role: PlayerRole) {
    setScenarioMode(false);
    setJoinError(null);
    setScenarioFocusRole(null);
    try {
      await createRoom(role);
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : "방을 만들 수 없습니다.");
    }
  }

  async function handleJoinByCode(code: string, role: PlayerRole) {
    setScenarioMode(false);
    setJoinError(null);
    setScenarioFocusRole(null);
    try {
      await joinRoom(code, role);
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : "방에 참여할 수 없습니다.");
    }
  }

  function handleLeave() {
    if (scenarioMode) {
      setScenarioMode(false);
      setScenarioPaused(false);
      setScenarioFocusRole(null);
      return;
    }
    leave();
  }

  if (!isInSimulator) {
    return (
      <main className="join-screen">
        <JoinPanel
          connectionStatus={connectionStatus}
          errorMessage={joinError ?? errorMessage}
          initialCode={initialCode}
          onCreate={handleCreate}
          onJoinByCode={handleJoinByCode}
          onScenarioStart={(role) => {
            setJoinError(null);
            setScenarioPaused(false);
            setScenarioFocusRole(role);
            setScenarioMode(true);
          }}
        />
      </main>
    );
  }

  return (
    <main className="simulator-screen">
      <SimulatorCanvas />
      <ConnectionOverlay
        name={scenarioMode ? `${scenarioFocusRole ?? ""} 공략보기` : selfName || "플레이어"}
        role={scenarioMode ? scenarioFocusRole : selfRole}
        roomId={scenarioMode ? null : roomId}
        controlsLocked={!scenarioMode && controlsLocked}
        remainingSec={scenarioMode ? null : gimmick.roomRemainingSec}
        canChangeRole={!scenarioMode && !gimmickRunning}
        occupiedRoles={occupiedByOthers}
        onChangeRole={setRole}
        sessionId={scenarioMode ? "scenario" : sessionId}
        playerCount={playerCount}
        status={scenarioMode ? "auto" : connectionStatus}
        onLeave={handleLeave}
      />
      {!scenarioMode && <GimmickPanel onControl={sendGimmick} />}
      {scenarioMode && (
        <div className="gimmick-panel scenario-panel">
          <div className="gimmick-row">
            <span className={`gimmick-status gimmick-status--${gimmick.phase}`}>
              공략 보기 · {PHASE_LABEL[gimmick.phase] ?? gimmick.phase}
              {gimmick.round > 0 ? ` · ${gimmick.round}번 탑` : ""}
              {scenarioPaused ? " · 일시정지" : ""}
            </span>
          </div>
          <button className="scenario-button" type="button" onClick={() => setScenarioPaused((value) => !value)}>
            {scenarioPaused ? "재개" : "일시정지"}
          </button>
          <div className="gimmick-logs">
            {gimmick.logs.length === 0 ? (
              <div className="gimmick-log-empty">로그 없음</div>
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
      )}
    </main>
  );
}
