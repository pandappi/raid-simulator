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

const LINE_HEIGHT = 5; // 탑 중앙 수직 가이드 라인 높이(m)
const ORB_RADIUS = 0.34;

function Tower({ tower, elapsed }: { tower: TowerView; elapsed: number }) {
  const spawnAt = MISSING_CAST_MS + (tower.round - 1) * TOWER_INTERVAL_MS;
  const progress = Math.min(1, Math.max(0, (elapsed - spawnAt) / TOWER_ACTIVATE_MS));
  // 구체는 위에서 천천히 내려와 판정 시점(progress=1)에 바닥에 닿는다.
  const orbY = ORB_RADIUS + (LINE_HEIGHT - ORB_RADIUS) * (1 - progress);

  return (
    <group position={[tower.x, 0, tower.z]}>
      {/* 외곽 고리 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.07, 0]}>
        <ringGeometry args={[TOWER_RADIUS - 0.18, TOWER_RADIUS, 64]} />
        <meshBasicMaterial color="#4dd2ff" transparent opacity={0.9} depthWrite={false} />
      </mesh>
      {/* 중앙 수직 가이드 라인 */}
      <mesh position={[0, LINE_HEIGHT / 2, 0]}>
        <cylinderGeometry args={[0.045, 0.045, LINE_HEIGHT, 8]} />
        <meshBasicMaterial color="#4dd2ff" transparent opacity={0.45} depthWrite={false} />
      </mesh>
      {/* 떨어지는 구체 */}
      <mesh position={[0, orbY, 0]}>
        <sphereGeometry args={[ORB_RADIUS, 20, 20]} />
        <meshStandardMaterial color="#9fe8ff" emissive="#2aa6d0" emissiveIntensity={0.7} roughness={0.4} />
      </mesh>
    </group>
  );
}
