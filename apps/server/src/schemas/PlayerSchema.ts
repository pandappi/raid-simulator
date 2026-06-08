import { Schema, type } from "@colyseus/schema";

export class PlayerSchema extends Schema {
  @type("string") id = "";
  @type("string") name = "";
  @type("string") role = "";
  @type("number") x = 0;
  @type("number") z = 0;
  @type("number") rotation = 0;
}
