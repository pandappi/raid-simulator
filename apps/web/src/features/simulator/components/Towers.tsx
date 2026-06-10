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

// 구체는 탑과 같은 크기(반지름 = TOWER_RADIUS). 위에서 내려와 판정 시점에 바닥에 닿는다.
const ORB_RADIUS = TOWER_RADIUS;
const FALL_DISTANCE = 9; // 구체 바닥이 떨어지는 높이(m)
const LINE_HEIGHT = ORB_RADIUS * 2 + FALL_DISTANCE; // 가이드 라인 높이

function Tower({ tower, elapsed }: { tower: TowerView; elapsed: number }) {
  const spawnAt = MISSING_CAST_MS + (tower.round - 1) * TOWER_INTERVAL_MS;
  const progress = Math.min(1, Math.max(0, (elapsed - spawnAt) / TOWER_ACTIVATE_MS));
  // progress=1에서 구체 바닥이 y=0(바닥)에 닿도록 중심 y를 계산.
  const orbY = ORB_RADIUS + FALL_DISTANCE * (1 - progress);

  return (
    <group position={[tower.x, 0, tower.z]}>
      {/* 외곽 고리 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.07, 0]}>
        <ringGeometry args={[TOWER_RADIUS - 0.18, TOWER_RADIUS, 64]} />
        <meshBasicMaterial color="#4dd2ff" transparent opacity={0.9} depthWrite={false} />
      </mesh>
      {/* 중앙 수직 가이드 라인 */}
      <mesh position={[0, LINE_HEIGHT / 2, 0]}>
        <cylinderGeometry args={[0.05, 0.05, LINE_HEIGHT, 8]} />
        <meshBasicMaterial color="#4dd2ff" transparent opacity={0.4} depthWrite={false} />
      </mesh>
      {/* 떨어지는 구체(탑 크기 · 반투명) */}
      <mesh position={[0, orbY, 0]}>
        <sphereGeometry args={[ORB_RADIUS, 32, 24]} />
        <meshStandardMaterial
          color="#7fd6f5"
          emissive="#2aa6d0"
          emissiveIntensity={0.5}
          roughness={0.35}
          transparent
          opacity={0.4}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
