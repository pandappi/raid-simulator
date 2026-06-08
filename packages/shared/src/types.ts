import type { PlayerRole } from "./roles.js";
import type { MarkerType } from "./gimmick.js";

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
  // 서버 재조정(reconciliation)용: 입력 순번과 이 입력이 적용되는 시간(초).
  seq?: number;
  dt?: number;
};

export type PlayerSnapshot = {
  id: string;
  name: string;
  role: PlayerRole;
  x: number;
  z: number;
  rotation: number;
  // 서버가 마지막으로 처리한 이 플레이어의 입력 순번(클라 재조정에 사용).
  lastSeq: number;
  // 머리징 종류와 시각 표시 여부(기믹).
  marker: MarkerType | "";
  markerVisible: boolean;
};

export type RoomPhase = "waiting" | "playing";

export type JoinOptions = {
  name: string;
  role: PlayerRole;
};
