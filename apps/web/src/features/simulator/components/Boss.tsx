import { BOSS_RADIUS } from "@raid-simulator/shared";
import { useSimulatorStore } from "../stores/simulatorStore";

export function Boss() {
  const gimmick = useSimulatorStore((state) => state.gimmick);
  const x = gimmick.bossX ?? 0;
  const z = gimmick.bossZ ?? 0;
  const radius = gimmick.bossRadius ?? BOSS_RADIUS;

  return (
    <group position={[x, 0, z]}>
      {/* 보스 본체 */}
      <mesh position={[0, 1.6, 0]} castShadow>
        <cylinderGeometry args={[1.3, 1.6, 3.2, 24]} />
        <meshStandardMaterial color="#7a2230" emissive="#33060d" emissiveIntensity={0.4} roughness={0.6} />
      </mesh>
      {/* 히트박스 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
        <ringGeometry args={[radius - 0.12, radius, 96]} />
        <meshBasicMaterial color="#d05a6a" transparent opacity={0.55} depthWrite={false} />
      </mesh>
    </group>
  );
}
