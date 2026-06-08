import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { Mesh } from "three";
import { TOWER_ACTIVATE_MS, TOWER_RADIUS } from "@raid-simulator/shared";
import { useSimulatorStore, type TowerView } from "../stores/simulatorStore";

export function Towers() {
  const towers = useSimulatorStore((state) => state.gimmick.towers);
  return (
    <group>
      {towers.map((tower) => (
        <Tower key={tower.id} tower={tower} />
      ))}
    </group>
  );
}

function Tower({ tower }: { tower: TowerView }) {
  const fillRef = useRef<Mesh>(null);
  // 탑이 처음 보인 로컬 시각 기준으로 8초 채움 애니메이션(서버 시계 동기화 불필요).
  const seenAtRef = useRef<number>(performance.now());

  useEffect(() => {
    seenAtRef.current = performance.now();
  }, [tower.id]);

  useFrame(() => {
    const fill = fillRef.current;
    if (!fill) return;
    const progress = Math.min(1, (performance.now() - seenAtRef.current) / TOWER_ACTIVATE_MS);
    const scale = Math.max(0.001, progress);
    fill.scale.set(scale, scale, 1);
  });

  return (
    <group position={[tower.x, 0, tower.z]}>
      {/* 외곽 고리 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.07, 0]}>
        <ringGeometry args={[TOWER_RADIUS - 0.18, TOWER_RADIUS, 64]} />
        <meshBasicMaterial color="#4dd2ff" transparent opacity={0.9} depthWrite={false} />
      </mesh>
      {/* 작동까지 채워지는 내부 원 */}
      <mesh ref={fillRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <circleGeometry args={[TOWER_RADIUS - 0.2, 48]} />
        <meshBasicMaterial color="#4dd2ff" transparent opacity={0.28} depthWrite={false} />
      </mesh>
      <Html position={[0, 0.1, 0]} center distanceFactor={22}>
        <div className="tower-label">{tower.round}</div>
      </Html>
    </group>
  );
}
