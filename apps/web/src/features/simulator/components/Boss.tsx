import { BOSS_RADIUS } from "@raid-simulator/shared";

export function Boss() {
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
    </group>
  );
}
