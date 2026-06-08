import type { PlayerRole } from "./roles.js";

export type Vector2Like = {
  x: number;
  z: number;
};

export type ClientInput = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  cameraYaw?: number;
};

export type PlayerSnapshot = {
  id: string;
  name: string;
  role: PlayerRole;
  x: number;
  z: number;
  rotation: number;
};

export type RoomPhase = "waiting" | "playing";

export type JoinOptions = {
  name: string;
  role: PlayerRole;
};
