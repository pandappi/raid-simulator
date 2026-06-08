import { isPlayerRole, MAX_PLAYERS, type JoinOptions, type PlayerRole } from "@raid-simulator/shared";
import type { RaidRoomState } from "../schemas/RaidRoomState.js";

const MAX_NAME_LENGTH = 20;

type ValidatedJoinOptions = {
  name: string;
  role: PlayerRole;
};

export function validateJoinOptions(options: unknown, state: RaidRoomState): ValidatedJoinOptions {
  if (!isRecord(options)) {
    throw new Error("잘못된 입장 요청입니다.");
  }

  const name = typeof options.name === "string" ? options.name.trim() : "";
  const role = options.role;

  if (!name) {
    throw new Error("이름을 입력해주세요.");
  }

  if (name.length > MAX_NAME_LENGTH) {
    throw new Error(`이름은 ${MAX_NAME_LENGTH}자 이하로 입력해주세요.`);
  }

  if (!isPlayerRole(role)) {
    throw new Error("역할을 선택해주세요.");
  }

  if (state.players.size >= MAX_PLAYERS) {
    throw new Error("방이 가득 찼습니다.");
  }

  for (const player of state.players.values()) {
    if (player.role === role) {
      throw new Error("이미 선택된 역할입니다. 다른 역할을 선택해주세요.");
    }
  }

  return { name, role } satisfies JoinOptions;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
