import { Html } from "@react-three/drei";
import { PLAYER_HEIGHT, type PlayerSnapshot } from "@raid-simulator/shared";

type PlayerLabelProps = {
  player: PlayerSnapshot;
};

export function PlayerLabel({ player }: PlayerLabelProps) {
  return (
    <Html position={[0, PLAYER_HEIGHT + 0.65, 0]} center distanceFactor={18}>
      <div className="player-label" title={player.name}>
        {player.role}
      </div>
    </Html>
  );
}
