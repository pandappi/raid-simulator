import { useMemo } from "react";
import { BufferGeometry, Float32BufferAttribute } from "three";
import { useSimulatorStore, type AoeView } from "../stores/simulatorStore";

const AOE_COLOR = "#ff9a3c"; // 옅은 주황(피해)
const DANGER_COLOR = "#ff5f5f"; // 보스 공격 텔레그래프(위험)
const STACK_COLOR = "#86e36b"; // 연두(쉐어 장판)
const BLASTER_COLOR = "#b69cff"; // 연보라(알테마 블래스터 꺽쇠 투사체)

function aoeColor(aoe: AoeView): string {
  if (aoe.kind === "blaster") return BLASTER_COLOR;
  if (aoe.kind === "stack") return STACK_COLOR;
  if (aoe.danger || aoe.kind === "kick") return DANGER_COLOR;
  if (aoe.kind === "clone") return "#9b7cff";
  return AOE_COLOR;
}

export function AoeIndicators() {
  const aoes = useSimulatorStore((state) => state.gimmick.aoes);
  return (
    <group>
      {aoes.map((aoe) => {
        if (aoe.kind === "cloneSpot") return <CloneSpot key={aoe.id} aoe={aoe} />;
        if (aoe.kind === "blaster") return <BlasterAoe key={aoe.id} aoe={aoe} />;
        if (aoe.kind === "rect") return <RectAoe key={aoe.id} aoe={aoe} />;
        if (aoe.kind === "cone" || aoe.kind === "kick") return <ConeAoe key={aoe.id} aoe={aoe} />;
        return <CircleAoe key={aoe.id} aoe={aoe} />;
      })}
    </group>
  );
}

function BlasterAoe({ aoe }: { aoe: AoeView }) {
  // dir 방향을 향한 꺽쇠(`<`) 모양 투사체. (x,z)가 현재 위치.
  const geometry = useMemo(() => {
    const w = (aoe.width ?? 8) / 2;
    const head = (aoe.width ?? 8) * 0.7;
    const back = (aoe.width ?? 8) * 0.25;
    const fx = Math.sin(aoe.dir);
    const fz = Math.cos(aoe.dir);
    const rx = fz;
    const rz = -fx;
    const v = (along: number, side: number) => [fx * along + rx * side, 0, fz * along + rz * side];
    // 두께감 있는 꺽쇠: 앞 꼭짓점 + 양 날개 + 안쪽 V
    const positions = [...v(head, 0), ...v(0, -w), ...v(-back, 0), ...v(head, 0), ...v(-back, 0), ...v(0, w)];
    const geom = new BufferGeometry();
    geom.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geom.computeVertexNormals();
    return geom;
  }, [aoe.dir, aoe.width]);

  return (
    <mesh geometry={geometry} position={[aoe.x, 0.12, aoe.z]}>
      <meshBasicMaterial color={BLASTER_COLOR} transparent opacity={0.85} depthWrite={false} side={2} />
    </mesh>
  );
}

function CircleAoe({ aoe }: { aoe: AoeView }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[aoe.x, 0.08, aoe.z]}>
      <circleGeometry args={[aoe.radius, 48]} />
      <meshBasicMaterial color={aoeColor(aoe)} transparent opacity={aoe.kind === "clone" ? 0.24 : 0.4} depthWrite={false} />
    </mesh>
  );
}

function RectAoe({ aoe }: { aoe: AoeView }) {
  // (x,z)에서 dir 방향으로 length만큼 뻗는, 폭 width의 직선 장판. atan2(x,z) 규약.
  const geometry = useMemo(() => {
    const length = aoe.length ?? aoe.range ?? 10;
    const halfW = (aoe.width ?? 4) / 2;
    const fx = Math.sin(aoe.dir);
    const fz = Math.cos(aoe.dir);
    const rx = fz;
    const rz = -fx;
    const p = (along: number, side: number) => [fx * along + rx * side, 0, fz * along + rz * side];
    const positions = [...p(0, -halfW), ...p(0, halfW), ...p(length, halfW), ...p(length, -halfW)];
    const geom = new BufferGeometry();
    geom.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geom.setIndex([0, 1, 2, 0, 2, 3]);
    geom.computeVertexNormals();
    return geom;
  }, [aoe.dir, aoe.length, aoe.range, aoe.width]);

  return (
    <mesh geometry={geometry} position={[aoe.x, 0.08, aoe.z]}>
      <meshBasicMaterial color={aoeColor(aoe)} transparent opacity={0.4} depthWrite={false} side={2} />
    </mesh>
  );
}

function CloneSpot({ aoe }: { aoe: AoeView }) {
  return (
    <group position={[aoe.x, 0, aoe.z]}>
      <mesh position={[0, 0.42, 0]}>
        <cylinderGeometry args={[0.32, 0.38, 0.84, 18]} />
        <meshBasicMaterial color="#b79cff" transparent opacity={0.58} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.09, 0]}>
        <ringGeometry args={[0.5, 0.64, 32]} />
        <meshBasicMaterial color="#d8c8ff" transparent opacity={0.68} depthWrite={false} />
      </mesh>
    </group>
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
      <meshBasicMaterial color={aoeColor(aoe)} transparent opacity={0.4} depthWrite={false} side={2} />
    </mesh>
  );
}
