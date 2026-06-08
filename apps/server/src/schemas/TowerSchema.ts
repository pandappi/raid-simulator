import { Schema, type } from "@colyseus/schema";

export class TowerSchema extends Schema {
  @type("string") id = "";
  @type("number") x = 0;
  @type("number") z = 0;
  @type("number") round = 0;
}
