import { MapSchema, Schema, type } from "@colyseus/schema";
import { PlayerSchema } from "./PlayerSchema.js";

export class RaidRoomState extends Schema {
  @type("string") phase = "waiting";
  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
}
