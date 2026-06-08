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

  const isConnected = connectionStatus === "connected";
  const playerCount = useMemo(() => Object.keys(players).length, [players]);

  useKeyboardInput({ enabled: isConnected });
  usePrediction({ enabled: isConnected, sendInput });

  async function handleJoin(name: string, role: PlayerRole) {
    setJoinError(null);
    try {
      await join({ name, role });
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : "서버에 연결할 수 없습니다.");
    }
  }

  if (!isConnected) {
    return (
      <main className="join-screen">
        <JoinPanel
          connectionStatus={connectionStatus}
          errorMessage={joinError ?? errorMessage}
          onJoin={handleJoin}
        />
      </main>
    );
  }

  return (
    <main className="simulator-screen">
      <SimulatorCanvas />
      <ConnectionOverlay
        name={selfName}
        role={selfRole}
        sessionId={sessionId}
        playerCount={playerCount}
        status={connectionStatus}
        onLeave={leave}
      />
      <GimmickPanel onControl={sendGimmick} />
    </main>
  );
}
