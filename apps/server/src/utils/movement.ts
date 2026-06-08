import {
  ARENA_RADIUS,
  PLAYER_MOVE_SPEED,
  type ClientInput,
  type PlayerRole,
  type Vector2Like
} from "@raid-simulator/shared";
import type { PlayerSchema } from "../schemas/PlayerSchema.js";

export const EMPTY_INPUT: ClientInput = {
  up: false,
  down: false,
  left: false,
  right: false,
  cameraYaw: Math.PI
};

export const ROLE_INITIAL_POSITIONS: Record<PlayerRole, Vector2Like> = {
  MT: { x: 0, z: -8 },
  ST: { x: 2, z: -8 },
  H1: { x: -8, z: 0 },
  H2: { x: 8, z: 0 },
  D1: { x: -4, z: 6 },
  D2: { x: 4, z: 6 },
  D3: { x: -8, z: 6 },
  D4: { x: 8, z: 6 }
};

const MOVEMENT_RADIUS = ARENA_RADIUS - 0.8;

export function isClientInput(value: unknown): value is ClientInput {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const input = value as Record<string, unknown>;
  return (
    typeof input.up === "boolean" &&
    typeof input.down === "boolean" &&
    typeof input.left === "boolean" &&
    typeof input.right === "boolean" &&
    (input.cameraYaw === undefined || (typeof input.cameraYaw === "number" && Number.isFinite(input.cameraYaw)))
  );
}

export function updatePlayerPosition(player: PlayerSchema, input: ClientInput, deltaSeconds: number) {
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

  const length = Math.hypot(dx, dz);
  if (length > 0) {
    dx /= length;
    dz /= length;

    player.x += dx * PLAYER_MOVE_SPEED * deltaSeconds;
    player.z += dz * PLAYER_MOVE_SPEED * deltaSeconds;
    player.rotation = Math.atan2(dx, dz);
  }

  const distance = Math.hypot(player.x, player.z);
  if (distance > MOVEMENT_RADIUS) {
    const ratio = MOVEMENT_RADIUS / distance;
    player.x *= ratio;
    player.z *= ratio;
  }
}
