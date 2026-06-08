import { ARENA_RADIUS } from "@raid-simulator/shared";

export function Arena() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[ARENA_RADIUS, 128]} />
        <meshStandardMaterial color="#343a3f" roughness={0.82} metalness={0.02} />
      </mesh>
      {/* 맵 경계: 외곽 반지름 20m, 두께 2m, 밝은 회색 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <ringGeometry args={[ARENA_RADIUS - 2, ARENA_RADIUS, 160]} />
        <meshStandardMaterial color="#d6dbdf" roughness={0.7} metalness={0.05} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <ringGeometry args={[ARENA_RADIUS * 0.48, ARENA_RADIUS * 0.485, 96]} />
        <meshBasicMaterial color="#4a545f" />
      </mesh>
    </group>
  );
}
