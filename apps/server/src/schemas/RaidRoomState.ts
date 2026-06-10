import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";
import { PlayerSchema } from "./PlayerSchema.js";
import { TowerSchema } from "./TowerSchema.js";
import { AoeSchema } from "./AoeSchema.js";

export class RaidRoomState extends Schema {
  @type("string") phase = "waiting";
  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();

  // --- 기믹 상태 ---
  @type("string") gimmick = ""; // "" | "missing"
  @type("string") gimmickPhase = "idle"; // idle | running | success | failed
  @type("number") round = 0;
  @type("boolean") bossActive = false; // 보스(중앙) 표시 여부
  @type("string") bossCast = ""; // "" | "future" | "past"
  @type("string") lastEvenBossCast = ""; // "" | "future" | "past"
  @type("number") missingBaseIndex = 0;
  @type("number") missingRotationDirection = 1;
  @type("number") elapsed = 0; // 기믹 시작 후 경과(ms)
  @type("boolean") paused = false;
  // 실패로 중단된 경우 플레이어/봇 이동을 막는다(시작/중단 시 해제).
  @type("boolean") controlsLocked = false;
  @type({ map: TowerSchema }) towers = new MapSchema<TowerSchema>();
  @type([AoeSchema]) aoes = new ArraySchema<AoeSchema>();
  @type(["string"]) logs = new ArraySchema<string>();
}
