import { isPlayerRole, MAX_PLAYERS, type JoinOptions, type PlayerRole } from "@raid-simulator/shared";
import type { RaidRoomState } from "../schemas/RaidRoomState.js";
import { isBotId } from "../bots/BotController.js";

const MAX_NAME_LENGTH = 20;

type ValidatedJoinOptions = {
  name: string;
  role: PlayerRole;
};

export function validateJoinOptions(options: unknown, state: RaidRoomState): ValidatedJoinOptions {
  if (!isRecord(options)) {
    throw new Error("잘못된 입장 요청입니다.");
  }

  const rawName = typeof options.name === "string" ? options.name.trim() : "";
  const role = options.role;

  if (rawName.length > MAX_NAME_LENGTH) {
    throw new Error(`이름은 ${MAX_NAME_LENGTH}자 이하로 입력해주세요.`);
  }

  if (!isPlayerRole(role)) {
    throw new Error("역할을 선택해주세요.");
  }

  // 이름은 선택값. 비워두면 역할명으로 식별한다.
  const name = rawName || role;

  const humanCount = [...state.players.keys()].filter((id) => !isBotId(id)).length;
  if (humanCount >= MAX_PLAYERS) {
    throw new Error("방이 가득 찼습니다.");
  }

  state.players.forEach((player, id) => {
    if (!isBotId(id) && player.role === role) {
      throw new Error("이미 선택된 역할입니다. 다른 역할을 선택해주세요.");
    }
  });

  return { name, role } satisfies JoinOptions;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
