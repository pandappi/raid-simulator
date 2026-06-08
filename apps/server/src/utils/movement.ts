import { stepMovement, type ClientInput, type PlayerRole, type Vector2Like } from "@raid-simulator/shared";
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
    (input.cameraYaw === undefined || (typeof input.cameraYaw === "number" && Number.isFinite(input.cameraYaw))) &&
    (input.seq === undefined || (typeof input.seq === "number" && Number.isFinite(input.seq))) &&
    (input.dt === undefined || (typeof input.dt === "number" && Number.isFinite(input.dt)))
  );
}

export function updatePlayerPosition(player: PlayerSchema, input: ClientInput, deltaSeconds: number) {
  const next = stepMovement({ x: player.x, z: player.z, rotation: player.rotation }, input, deltaSeconds);
  player.x = next.x;
  player.z = next.z;
  player.rotation = next.rotation;
}
