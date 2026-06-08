import { ARENA_RADIUS, PLAYER_MOVE_SPEED } from "./constants.js";
import type { ClientInput } from "./types.js";

export const MOVEMENT_RADIUS = ARENA_RADIUS - 0.8;

export type MovementState = {
  x: number;
  z: number;
  rotation: number;
};

/**
 * 입력과 경과 시간을 받아 다음 위치를 계산하는 순수 함수.
 * 서버(권위)와 클라이언트(예측)가 동일한 결과를 내도록 양쪽에서 공유한다.
 */
export function stepMovement(state: MovementState, input: ClientInput, deltaSeconds: number): MovementState {
  let strafe = 0;
  let forwardAmount = 0;

  if (input.up) forwardAmount += 1;
  if (input.down) forwardAmount -= 1;
  if (input.left) strafe -= 1;
  if (input.right) strafe += 1;

  let dx = 0;
  let dz = 0;

  if (typeof input.cameraYaw === "number") {
    const forwardX = Math.sin(input.cameraYaw);
    const forwardZ = Math.cos(input.cameraYaw);
    const rightX = -forwardZ;
    const rightZ = forwardX;

    dx = forwardX * forwardAmount + rightX * strafe;
    dz = forwardZ * forwardAmount + rightZ * strafe;
  } else {
    dx = strafe;
    dz = -forwardAmount;
  }

  let { x, z, rotation } = state;

  const length = Math.hypot(dx, dz);
  if (length > 0) {
    dx /= length;
    dz /= length;

    x += dx * PLAYER_MOVE_SPEED * deltaSeconds;
    z += dz * PLAYER_MOVE_SPEED * deltaSeconds;
    rotation = Math.atan2(dx, dz);
  }

  const distance = Math.hypot(x, z);
  if (distance > MOVEMENT_RADIUS) {
    const ratio = MOVEMENT_RADIUS / distance;
    x *= ratio;
    z *= ratio;
  }

  return { x, z, rotation };
}
