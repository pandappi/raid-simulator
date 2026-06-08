import { Html } from "@react-three/drei";
import { BOSS_RADIUS } from "@raid-simulator/shared";
import { useSimulatorStore } from "../stores/simulatorStore";

export function Boss() {
  const bossActive = useSimulatorStore((state) => state.gimmick.bossActive);
  const bossCast = useSimulatorStore((state) => state.gimmick.bossCast);

  if (!bossActive) {
    return null;
  }

  const castLabel = bossCast === "future" ? "미래의 종언" : bossCast === "past" ? "과거의 종언" : null;

  return (
    <group>
      {/* 보스 본체 */}
      <mesh position={[0, 1.6, 0]} castShadow>
        <cylinderGeometry args={[1.3, 1.6, 3.2, 24]} />
        <meshStandardMaterial color="#7a2230" emissive="#33060d" emissiveIntensity={0.4} roughness={0.6} />
      </mesh>
      {/* 히트박스(반지름 4m) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
        <ringGeometry args={[BOSS_RADIUS - 0.12, BOSS_RADIUS, 96]} />
        <meshBasicMaterial color="#d05a6a" transparent opacity={0.55} depthWrite={false} />
      </mesh>
      {castLabel && (
        <Html position={[0, 4.2, 0]} center distanceFactor={26}>
          <div className="boss-cast">{castLabel}</div>
        </Html>
      )}
    </group>
  );
}
