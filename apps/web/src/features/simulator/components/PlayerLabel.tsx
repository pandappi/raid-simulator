import { Html } from "@react-three/drei";
import { PLAYER_HEIGHT, type PlayerSnapshot } from "@raid-simulator/shared";

type PlayerLabelProps = {
  player: PlayerSnapshot;
};

const MARKER_LABEL: Record<string, { text: string; color: string }> = {
  share: { text: "쉐어", color: "#4dabf7" },
  spread: { text: "산개", color: "#51cf66" },
  cone: { text: "부채꼴", color: "#ff922b" }
};

export function PlayerLabel({ player }: PlayerLabelProps) {
  const marker = player.markerVisible ? MARKER_LABEL[player.marker] : undefined;

  return (
    <Html position={[0, PLAYER_HEIGHT + 0.65, 0]} center distanceFactor={18}>
      {marker && (
        <div className="marker-chip" style={{ backgroundColor: marker.color }}>
          {marker.text}
        </div>
      )}
      <div className="player-label" title={player.name}>
        {player.role}
      </div>
    </Html>
  );
}
