import { ARENA_RADIUS } from "@raid-simulator/shared";

export function Arena() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[ARENA_RADIUS, 128]} />
        <meshStandardMaterial color="#343a3f" roughness={0.82} metalness={0.02} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
        <torusGeometry args={[ARENA_RADIUS, 0.08, 10, 160]} />
        <meshStandardMaterial color="#e6eef3" emissive="#1f6b68" emissiveIntensity={0.12} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <ringGeometry args={[ARENA_RADIUS * 0.48, ARENA_RADIUS * 0.485, 96]} />
        <meshBasicMaterial color="#4a545f" />
      </mesh>
    </group>
  );
}
