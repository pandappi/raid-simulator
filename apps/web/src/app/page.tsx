"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { isPlayerRole, type PlayerRole } from "@raid-simulator/shared";
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
const GAME_SERVER_URL = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? "ws://localhost:2567";
const GAME_SERVER_HTTP_URL = GAME_SERVER_URL.replace(/^ws/, "http");
const PHASE_LABEL: Record<string, string> = {
  idle: "대기",
  running: "진행 중",
  success: "성공",
  failed: "실패 포함"
};

export default function Home() {
  const { join, leave, sendInput, sendGimmick } = useRaidRoom();
  const connectionStatus = useSimulatorStore((state) => state.connectionStatus);
  const errorMessage = useSimulatorStore((state) => state.errorMessage);
  const sessionId = useSimulatorStore((state) => state.sessionId);
  const selfName = useSimulatorStore((state) => state.selfName);
  const selfRole = useSimulatorStore((state) => state.selfRole);
  const players = useSimulatorStore((state) => state.players);
  const gimmick = useSimulatorStore((state) => state.gimmick);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [scenarioMode, setScenarioMode] = useState(false);
  const [scenarioPaused, setScenarioPaused] = useState(false);
  const [scenarioFocusRole, setScenarioFocusRole] = useState<PlayerRole | null>(null);
  const [occupiedRoles, setOccupiedRoles] = useState<PlayerRole[]>([]);
  const [simulationRunning, setSimulationRunning] = useState(false);

  const isConnected = connectionStatus === "connected";
  const isInSimulator = isConnected || scenarioMode;
  const playerCount = useMemo(() => Object.keys(players).length, [players]);
  // 실패로 중단되면 플레이어 컨트롤(입력/예측)을 멈춘다.
  const controlsLocked = gimmick.controlsLocked;

  useScenarioPlayback(scenarioMode, scenarioPaused, scenarioFocusRole);
  useKeyboardInput({ enabled: isConnected && !scenarioMode && !controlsLocked });
  usePrediction({ enabled: isConnected && !scenarioMode && !controlsLocked, sendInput });

  useEffect(() => {
    if (isInSimulator) {
      return;
    }

    let cancelled = false;
    async function loadOccupiedRoles() {
      try {
        const response = await fetch(`${GAME_SERVER_HTTP_URL}/state`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error("failed");
        }
        const data = (await response.json()) as { occupiedRoles?: unknown; running?: unknown };
        const nextRoles = Array.isArray(data.occupiedRoles) ? data.occupiedRoles.filter(isPlayerRole) : [];
        if (!cancelled) {
          setOccupiedRoles(nextRoles);
          setSimulationRunning(data.running === true);
        }
      } catch {
        if (!cancelled) {
          setOccupiedRoles([]);
          setSimulationRunning(false);
        }
      }
    }

    loadOccupiedRoles();
    const interval = window.setInterval(loadOccupiedRoles, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [isInSimulator]);

  async function handleJoin(name: string, role: PlayerRole) {
    setScenarioMode(false);
    setJoinError(null);
    setScenarioFocusRole(null);
    try {
      await join({ name, role });
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : "서버에 연결할 수 없습니다.");
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
          occupiedRoles={occupiedRoles}
          simulationRunning={simulationRunning}
          onJoin={handleJoin}
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
        name={scenarioMode ? `${scenarioFocusRole ?? ""} 공략보기` : selfName}
        role={scenarioMode ? scenarioFocusRole : selfRole}
        controlsLocked={!scenarioMode && controlsLocked}
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
