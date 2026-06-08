import colyseus, { type Client } from "colyseus";
import { SERVER_TICK_MS, type ClientInput, type JoinOptions } from "@raid-simulator/shared";
import { PlayerSchema } from "../schemas/PlayerSchema.js";
import { RaidRoomState } from "../schemas/RaidRoomState.js";
import { EMPTY_INPUT, isClientInput, ROLE_INITIAL_POSITIONS, updatePlayerPosition } from "../utils/movement.js";
import { validateJoinOptions } from "../utils/validateJoinOptions.js";

const { Room } = colyseus;

export class RaidRoom extends Room<RaidRoomState> {
  private inputs = new Map<string, ClientInput>();

  onCreate() {
    this.maxClients = 8;
    this.setState(new RaidRoomState());

    this.onMessage("input", (client, payload) => {
      if (!this.state.players.has(client.sessionId) || !isClientInput(payload)) {
        return;
      }

      this.inputs.set(client.sessionId, payload);
    });

    this.setSimulationInterval((deltaTime) => this.update(deltaTime), SERVER_TICK_MS);
  }

  onAuth(_client: Client, options: unknown) {
    return validateJoinOptions(options, this.state);
  }

  onJoin(client: Client, options: unknown, auth?: JoinOptions) {
    const joinOptions = auth ?? validateJoinOptions(options, this.state);
    const initialPosition = ROLE_INITIAL_POSITIONS[joinOptions.role];

    const player = new PlayerSchema();
    player.id = client.sessionId;
    player.name = joinOptions.name;
    player.role = joinOptions.role;
    player.x = initialPosition.x;
    player.z = initialPosition.z;

    this.state.players.set(client.sessionId, player);
    this.inputs.set(client.sessionId, { ...EMPTY_INPUT });
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.inputs.delete(client.sessionId);
  }

  private update(deltaTime: number) {
    const deltaSeconds = deltaTime / 1000;

    for (const [sessionId, player] of this.state.players.entries()) {
      const input = this.inputs.get(sessionId) ?? EMPTY_INPUT;
      updatePlayerPosition(player, input, deltaSeconds);
    }
  }
}
