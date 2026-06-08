import { ARENA_RADIUS } from "@raid-simulator/shared";

export function Arena() {
  return (
    <group>
      {/* 원형판: 반지름 20m, 두께(높이) 2m, 밝은 회색. 윗면을 y=0에 맞춰 아래로 깐다. */}
      <mesh position={[0, -1, 0]} receiveShadow>
        <cylinderGeometry args={[ARENA_RADIUS, ARENA_RADIUS, 2, 128]} />
        <meshStandardMaterial color="#aeb6bd" roughness={0.82} metalness={0.02} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <ringGeometry args={[ARENA_RADIUS * 0.48, ARENA_RADIUS * 0.485, 96]} />
        <meshBasicMaterial color="#4a545f" />
      </mesh>
    </group>
  );
}
