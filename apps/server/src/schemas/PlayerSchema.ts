import { Schema, type } from "@colyseus/schema";

export class PlayerSchema extends Schema {
  @type("string") id = "";
  @type("string") name = "";
  @type("string") role = "";
  @type("number") x = 0;
  @type("number") z = 0;
  @type("number") rotation = 0;
  // 마지막으로 처리한 입력 순번. 클라이언트가 재조정 시 기준으로 사용한다.
  @type("number") lastSeq = 0;
  // 머리징: "" | "share" | "spread" | "cone". markerVisible=false면 시각 표시만 숨김(판정은 유지).
  @type("string") marker = "";
  @type("boolean") markerVisible = false;
  // 징 부여 횟수(최대 4회 제한 판정용).
  @type("number") markerCount = 0;
}
