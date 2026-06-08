import { Grid } from "@react-three/drei";
import { ARENA_RADIUS } from "@raid-simulator/shared";
import { useSimulatorStore } from "../stores/simulatorStore";
import { Arena } from "./Arena";
import { CameraControls } from "./CameraControls";
import { PlayerCylinder } from "./PlayerCylinder";
import { Waymarks } from "./Waymarks";

export function SimulatorScene() {
  const players = useSimulatorStore((state) => state.players);
  const sessionId = useSimulatorStore((state) => state.sessionId);

  return (
    <>
      <color attach="background" args={["#171a1e"]} />
      <ambientLight intensity={0.65} />
      <directionalLight position={[8, 16, 10]} intensity={1.55} castShadow />
      <Arena />
      <Waymarks />
      <Grid
        args={[ARENA_RADIUS * 2, ARENA_RADIUS * 2]}
        cellSize={2}
        cellThickness={0.45}
        sectionSize={10}
        sectionThickness={0.9}
        infiniteGrid={false}
        fadeDistance={36}
        fadeStrength={1}
        position={[0, 0.025, 0]}
      />
      {Object.values(players).map((player) => (
        <PlayerCylinder key={player.id} player={player} isSelf={player.id === sessionId} />
      ))}
      <CameraControls />
    </>
  );
}
