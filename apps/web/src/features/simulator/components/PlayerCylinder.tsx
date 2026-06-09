import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group, MathUtils } from "three";
import type { PlayerSnapshot } from "@raid-simulator/shared";
import { PLAYER_HEIGHT, PLAYER_RADIUS } from "@raid-simulator/shared";
import { getPlayerColor } from "../utils/playerColor";
import { getSelfState, sampleRemote } from "../netcode";
import { PlayerLabel } from "./PlayerLabel";

type PlayerCylinderProps = {
  player: PlayerSnapshot;
  isSelf: boolean;
};

const PLAYER_VISUAL_RADIUS = PLAYER_RADIUS * 0.4;

export function PlayerCylinder({ player, isSelf }: PlayerCylinderProps) {
  const groupRef = useRef<Group>(null);
  const initializedRef = useRef(false);
  const color = getPlayerColor(player.role, isSelf);

  useFrame((_state, delta) => {
    const group = groupRef.current;
    if (!group) {
      return;
    }

    // 자기 캐릭터는 예측 위치(즉시 반응), 상대는 보간/외삽으로 부드럽게.
    const target = isSelf ? getSelfState() : sampleRemote(player.id);

    if (!target) {
      return;
    }

    if (!initializedRef.current) {
      group.position.set(target.x, 0, target.z);
      group.rotation.y = target.rotation;
      initializedRef.current = true;
      return;
    }

    if (isSelf) {
      // 예측은 정확값. 강한 댐핑으로 모니터 주사율 차이/드문 재조정 보정만 부드럽게 흡수.
      group.position.x = MathUtils.damp(group.position.x, target.x, 40, delta);
      group.position.z = MathUtils.damp(group.position.z, target.z, 40, delta);
      group.rotation.y = dampAngle(group.rotation.y, target.rotation, 24, delta);
    } else {
      // 보간 결과에 약한 댐핑만 더해 잔여 떨림을 잡는다.
      group.position.x = MathUtils.damp(group.position.x, target.x, 24, delta);
      group.position.z = MathUtils.damp(group.position.z, target.z, 24, delta);
      group.rotation.y = dampAngle(group.rotation.y, target.rotation, 18, delta);
    }
  });

  return (
    <group ref={groupRef}>
      <mesh position={[0, PLAYER_HEIGHT / 2, 0]} castShadow>
        <cylinderGeometry args={[PLAYER_VISUAL_RADIUS, PLAYER_VISUAL_RADIUS, PLAYER_HEIGHT, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={isSelf ? "#8a6f00" : "#000000"}
          emissiveIntensity={isSelf ? 0.25 : 0}
          roughness={0.62}
          metalness={0.08}
        />
      </mesh>
      <mesh position={[0, PLAYER_HEIGHT + 0.04, -PLAYER_VISUAL_RADIUS * 0.72]} castShadow>
        <boxGeometry args={[PLAYER_VISUAL_RADIUS * 0.52, 0.16, PLAYER_VISUAL_RADIUS * 0.92]} />
        <meshStandardMaterial color={isSelf ? "#fff2a8" : "#f7fafc"} roughness={0.5} />
      </mesh>
      {isSelf && (
        <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[PLAYER_VISUAL_RADIUS + 0.14, PLAYER_VISUAL_RADIUS + 0.2, 40]} />
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
