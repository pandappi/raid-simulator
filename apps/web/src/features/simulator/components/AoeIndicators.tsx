import { useMemo } from "react";
import { BufferGeometry, Float32BufferAttribute } from "three";
import { useSimulatorStore, type AoeView } from "../stores/simulatorStore";

const AOE_COLOR = "#ff9a3c"; // 투명도 있는 옅은 주황색

export function AoeIndicators() {
  const aoes = useSimulatorStore((state) => state.gimmick.aoes);
  return (
    <group>
      {aoes.map((aoe) => (aoe.kind === "cone" ? <ConeAoe key={aoe.id} aoe={aoe} /> : <CircleAoe key={aoe.id} aoe={aoe} />))}
    </group>
  );
}

function CircleAoe({ aoe }: { aoe: AoeView }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[aoe.x, 0.08, aoe.z]}>
      <circleGeometry args={[aoe.radius, 48]} />
      <meshBasicMaterial color={AOE_COLOR} transparent opacity={0.42} depthWrite={false} />
    </mesh>
  );
}

function ConeAoe({ aoe }: { aoe: AoeView }) {
  // 정점: 꼭짓점(원점) + 호 위 점들. 호 각 θ는 atan2(x,z) 규약을 따라
  // 위치 = (range*sin θ, 0, range*cos θ) 로 두면 dir이 곧 부채꼴 중심 방향이 된다.
  const geometry = useMemo(() => {
    const segments = 24;
    const half = aoe.angle / 2;
    const start = aoe.dir - half;
    const positions: number[] = [0, 0, 0];
    for (let i = 0; i <= segments; i++) {
      const theta = start + (aoe.angle * i) / segments;
      positions.push(aoe.range * Math.sin(theta), 0, aoe.range * Math.cos(theta));
    }
    const indices: number[] = [];
    for (let i = 1; i <= segments; i++) {
      indices.push(0, i, i + 1);
    }
    const geom = new BufferGeometry();
    geom.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    return geom;
  }, [aoe.dir, aoe.angle, aoe.range]);

  return (
    <mesh geometry={geometry} position={[aoe.x, 0.08, aoe.z]}>
      <meshBasicMaterial color={AOE_COLOR} transparent opacity={0.42} depthWrite={false} side={2} />
    </mesh>
  );
}
