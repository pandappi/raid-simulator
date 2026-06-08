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
}
