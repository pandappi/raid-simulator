import { Html } from "@react-three/drei";
import { MISSING_CAST_MS, TOWER_ACTIVATE_MS, TOWER_INTERVAL_MS, TOWER_RADIUS } from "@raid-simulator/shared";
import { useSimulatorStore, type TowerView } from "../stores/simulatorStore";

export function Towers() {
  const towers = useSimulatorStore((state) => state.gimmick.towers);
  const elapsed = useSimulatorStore((state) => state.gimmick.elapsed);
  return (
    <group>
      {towers.map((tower) => (
        <Tower key={tower.id} tower={tower} elapsed={elapsed} />
      ))}
    </group>
  );
}

function Tower({ tower, elapsed }: { tower: TowerView; elapsed: number }) {
  const spawnAt = MISSING_CAST_MS + (tower.round - 1) * TOWER_INTERVAL_MS;
  const progress = Math.min(1, Math.max(0, (elapsed - spawnAt) / TOWER_ACTIVATE_MS));
  const fillScale = Math.max(0.001, progress);

  return (
    <group position={[tower.x, 0, tower.z]}>
      {/* 외곽 고리 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.07, 0]}>
        <ringGeometry args={[TOWER_RADIUS - 0.18, TOWER_RADIUS, 64]} />
        <meshBasicMaterial color="#4dd2ff" transparent opacity={0.9} depthWrite={false} />
      </mesh>
      {/* 작동까지 채워지는 내부 원 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} scale={[fillScale, fillScale, 1]}>
        <circleGeometry args={[TOWER_RADIUS - 0.2, 48]} />
        <meshBasicMaterial color="#4dd2ff" transparent opacity={0.28} depthWrite={false} />
      </mesh>
      <Html position={[0, 0.1, 0]} center distanceFactor={22}>
        <div className="tower-label">{tower.round}</div>
      </Html>
    </group>
  );
}
