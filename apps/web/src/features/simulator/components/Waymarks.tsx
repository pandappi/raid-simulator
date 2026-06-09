import { Html } from "@react-three/drei";

type CircleWaymark = {
  label: string;
  color: string;
  position: [number, number, number];
};

type SquareWaymark = CircleWaymark;

const WAYMARK_DISTANCE = 13;

const CIRCLE_WAYMARKS: CircleWaymark[] = [
  { label: "A", color: "#ff4d4f", position: [0, 0.085, -WAYMARK_DISTANCE] },
  { label: "B", color: "#ffd43b", position: [WAYMARK_DISTANCE, 0.085, 0] },
  { label: "C", color: "#339af0", position: [0, 0.085, WAYMARK_DISTANCE] },
  { label: "D", color: "#9c6ade", position: [-WAYMARK_DISTANCE, 0.085, 0] }
];

// 중앙에서 13m 떨어진 대각선 지점 (각 축 = 13 / √2).
const SQUARE_AXIS = WAYMARK_DISTANCE * Math.SQRT1_2;

const SQUARE_WAYMARKS: SquareWaymark[] = [
  { label: "1", color: "#ff4d4f", position: [-SQUARE_AXIS, 0.09, -SQUARE_AXIS] },
  { label: "2", color: "#ffd43b", position: [SQUARE_AXIS, 0.09, -SQUARE_AXIS] },
  { label: "3", color: "#339af0", position: [SQUARE_AXIS, 0.09, SQUARE_AXIS] },
  { label: "4", color: "#9c6ade", position: [-SQUARE_AXIS, 0.09, SQUARE_AXIS] }
];

export function Waymarks() {
  return (
    <group>
      {CIRCLE_WAYMARKS.map((waymark) => (
        <group key={waymark.label} position={waymark.position}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[1.35, 64]} />
            <meshBasicMaterial color={waymark.color} opacity={0.42} transparent depthWrite={false} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
            <ringGeometry args={[1.34, 1.44, 64]} />
            <meshBasicMaterial color={waymark.color} opacity={0.92} transparent depthWrite={false} />
          </mesh>
          <WaymarkLabel label={waymark.label} color={waymark.color} />
        </group>
      ))}

      {SQUARE_WAYMARKS.map((waymark) => (
        <group key={waymark.label} position={waymark.position}>
          {/* 채움과 테두리 모두 4분할 도형 + 동일 회전 → 같은 방향의 정사각형 */}
          <mesh rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
            <circleGeometry args={[1.6, 4]} />
            <meshBasicMaterial color={waymark.color} opacity={0.42} transparent depthWrite={false} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, Math.PI / 4]} position={[0, 0.006, 0]}>
            <ringGeometry args={[1.56, 1.64, 4]} />
            <meshBasicMaterial color={waymark.color} opacity={0.92} transparent depthWrite={false} />
          </mesh>
          <WaymarkLabel label={waymark.label} color={waymark.color} />
        </group>
      ))}
    </group>
  );
}

function WaymarkLabel({ label, color }: { label: string; color: string }) {
  return (
    <Html position={[0, 0.08, 0]} center distanceFactor={18}>
      <div className="waymark-label" style={{ borderColor: color, color }}>
        {label}
      </div>
    </Html>
  );
}
