import { Html } from "@react-three/drei";
import { PLAYER_HEIGHT, type MarkerType, type PlayerSnapshot, type PriorityMarkerType } from "@raid-simulator/shared";

type PlayerLabelProps = {
  player: PlayerSnapshot;
};

export function PlayerLabel({ player }: PlayerLabelProps) {
  const marker = player.markerVisible && player.marker ? player.marker : undefined;

  return (
    <Html position={[0, PLAYER_HEIGHT + 0.65, 0]} center distanceFactor={18}>
      {marker && <MarkerIcon marker={marker} />}
      {player.priorityMarker && <PriorityMarkerIcon marker={player.priorityMarker} />}
      <div className="player-label" title={player.name}>
        {player.role}
      </div>
    </Html>
  );
}

function PriorityMarkerIcon({ marker }: { marker: PriorityMarkerType }) {
  const number = marker.endsWith("1") ? "1" : "2";
  if (marker.startsWith("number")) {
    return (
      <div className="priority-marker priority-marker--number" aria-label={`숫자징 ${number}`}>
        {number}
      </div>
    );
  }

  return (
    <div className="priority-marker priority-marker--forbid" aria-label={`금지징 ${number}`}>
      <span>{number}</span>
    </div>
  );
}

function MarkerIcon({ marker }: { marker: MarkerType }) {
  if (marker === "spread") {
    return <div className="marker-icon marker-icon--spread" aria-label="산개징" />;
  }

  if (marker === "cone") {
    return (
      <svg className="marker-icon marker-icon--cone" viewBox="0 0 44 44" aria-label="부채꼴징">
        <path d="M22 38 L2 18 A28 28 0 0 1 42 18 Z" />
      </svg>
    );
  }

  return (
    <svg className="marker-icon marker-icon--share" viewBox="0 0 44 44" aria-label="쉐어징">
      <circle cx="22" cy="22" r="6" />
      <path d="M22 16 L27 7 H24 V2 H20 V7 H17 Z" />
      <path d="M22 28 L17 37 H20 V42 H24 V37 H27 Z" />
      <path d="M16 22 L7 17 V20 H2 V24 H7 V27 Z" />
      <path d="M28 22 L37 27 V24 H42 V20 H37 V17 Z" />
    </svg>
  );
}
