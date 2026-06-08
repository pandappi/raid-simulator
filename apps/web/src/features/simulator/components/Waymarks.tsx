import { Html } from "@react-three/drei";

type CircleWaymark = {
  label: string;
  color: string;
  position: [number, number, number];
};

type SquareWaymark = CircleWaymark;

const CIRCLE_WAYMARKS: CircleWaymark[] = [
  { label: "A", color: "#ff4d4f", position: [0, 0.085, -10] },
  { label: "B", color: "#ffd43b", position: [10, 0.085, 0] },
  { label: "C", color: "#339af0", position: [0, 0.085, 10] },
  { label: "D", color: "#9c6ade", position: [-10, 0.085, 0] }
];

const SQUARE_WAYMARKS: SquareWaymark[] = [
  { label: "1", color: "#ff4d4f", position: [-15, 0.09, -15] },
  { label: "2", color: "#ffd43b", position: [15, 0.09, -15] },
  { label: "3", color: "#339af0", position: [15, 0.09, 15] },
  { label: "4", color: "#9c6ade", position: [-15, 0.09, 15] }
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
          <mesh rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
            <planeGeometry args={[2.25, 2.25]} />
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
