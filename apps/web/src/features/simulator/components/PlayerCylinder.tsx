import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group, MathUtils } from "three";
import type { PlayerSnapshot } from "@raid-simulator/shared";
import { PLAYER_HEIGHT, PLAYER_RADIUS } from "@raid-simulator/shared";
import { getPlayerColor } from "../utils/playerColor";
import { PlayerLabel } from "./PlayerLabel";

type PlayerCylinderProps = {
  player: PlayerSnapshot;
  isSelf: boolean;
};

export function PlayerCylinder({ player, isSelf }: PlayerCylinderProps) {
  const groupRef = useRef<Group>(null);
  const initializedRef = useRef(false);
  const color = getPlayerColor(player.role, isSelf);

  useFrame((_state, delta) => {
    const group = groupRef.current;
    if (!group) {
      return;
    }

    if (!initializedRef.current) {
      group.position.set(player.x, 0, player.z);
      group.rotation.y = player.rotation;
      initializedRef.current = true;
      return;
    }

    group.position.x = MathUtils.damp(group.position.x, player.x, 18, delta);
    group.position.z = MathUtils.damp(group.position.z, player.z, 18, delta);
    group.rotation.y = dampAngle(group.rotation.y, player.rotation, 18, delta);
  });

  return (
    <group ref={groupRef}>
      <mesh position={[0, PLAYER_HEIGHT / 2, 0]} castShadow>
        <cylinderGeometry args={[PLAYER_RADIUS, PLAYER_RADIUS, PLAYER_HEIGHT, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={isSelf ? "#8a6f00" : "#000000"}
          emissiveIntensity={isSelf ? 0.25 : 0}
          roughness={0.62}
          metalness={0.08}
        />
      </mesh>
      <mesh position={[0, PLAYER_HEIGHT + 0.04, -PLAYER_RADIUS * 0.72]} castShadow>
        <boxGeometry args={[PLAYER_RADIUS * 0.52, 0.16, PLAYER_RADIUS * 0.92]} />
        <meshStandardMaterial color={isSelf ? "#fff2a8" : "#f7fafc"} roughness={0.5} />
      </mesh>
      {isSelf && (
        <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[PLAYER_RADIUS + 0.14, PLAYER_RADIUS + 0.2, 40]} />
          <meshBasicMaterial color="#ffd400" />
        </mesh>
      )}
      <PlayerLabel player={player} />
    </group>
  );
}

function dampAngle(current: number, target: number, lambda: number, delta: number) {
  const difference = MathUtils.euclideanModulo(target - current + Math.PI, Math.PI * 2) - Math.PI;
  return current + difference * (1 - Math.exp(-lambda * delta));
}
