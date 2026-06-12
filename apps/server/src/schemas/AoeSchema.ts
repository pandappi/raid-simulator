import { Schema, type } from "@colyseus/schema";

// 공격 범위 표시(판정 후 1초). kind: share/spread/clone = 원, cone = 부채꼴, cloneSpot = 분신 위치.
export class AoeSchema extends Schema {
  @type("string") id = "";
  @type("string") kind = ""; // "share" | "spread" | "clone" | "cloneSpot" | "cone"
  @type("number") x = 0;
  @type("number") z = 0;
  @type("number") radius = 0; // 원형(share/spread)
  @type("number") dir = 0; // 부채꼴/직선 방향(rad)
  @type("number") angle = 0; // 부채꼴 전체 각(rad)
  @type("number") range = 0; // 부채꼴 사거리
  @type("number") length = 0; // 직선(rect) 길이
  @type("number") width = 0; // 직선(rect) 폭
  @type("boolean") danger = false; // 위험(빨강) 표시
}
