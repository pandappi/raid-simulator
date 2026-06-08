"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
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

export default function Home() {
  const { join, leave, sendInput, sendGimmick } = useRaidRoom();
  const connectionStatus = useSimulatorStore((state) => state.connectionStatus);
  const errorMessage = useSimulatorStore((state) => state.errorMessage);
  const sessionId = useSimulatorStore((state) => state.sessionId);
  const selfName = useSimulatorStore((state) => state.selfName);
  const selfRole = useSimulatorStore((state) => state.selfRole);
  const players = useSimulatorStore((state) => state.players);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [scenarioMode, setScenarioMode] = useState(false);
  const [scenarioPaused, setScenarioPaused] = useState(false);

  const isConnected = connectionStatus === "connected";
  const isInSimulator = isConnected || scenarioMode;
  const playerCount = useMemo(() => Object.keys(players).length, [players]);

  useScenarioPlayback(scenarioMode, scenarioPaused);
  useKeyboardInput({ enabled: isConnected && !scenarioMode });
  usePrediction({ enabled: isConnected && !scenarioMode, sendInput });

  async function handleJoin(name: string, role: PlayerRole) {
    setScenarioMode(false);
    setJoinError(null);
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
          onJoin={handleJoin}
          onScenarioStart={() => {
            setJoinError(null);
            setScenarioPaused(false);
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
        name={scenarioMode ? "자동 공략" : selfName}
        role={selfRole}
        sessionId={scenarioMode ? "scenario" : sessionId}
        playerCount={playerCount}
        status={scenarioMode ? "auto" : connectionStatus}
        onLeave={handleLeave}
      />
      {!scenarioMode && <GimmickPanel onControl={sendGimmick} />}
      {scenarioMode && (
        <div className="scenario-controls">
          <button className="scenario-button" type="button" onClick={() => setScenarioPaused((value) => !value)}>
            {scenarioPaused ? "재개" : "일시정지"}
          </button>
        </div>
      )}
    </main>
  );
}
