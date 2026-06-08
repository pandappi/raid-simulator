import colyseus, { type Client } from "colyseus";
import { MAX_INPUT_DT, type JoinOptions } from "@raid-simulator/shared";
import { PlayerSchema } from "../schemas/PlayerSchema.js";
import { RaidRoomState } from "../schemas/RaidRoomState.js";
import { isClientInput, ROLE_INITIAL_POSITIONS, updatePlayerPosition } from "../utils/movement.js";
import { validateJoinOptions } from "../utils/validateJoinOptions.js";

const { Room } = colyseus;

export class RaidRoom extends Room<RaidRoomState> {
  onCreate() {
    this.maxClients = 8;
    this.setState(new RaidRoomState());

    // 명령 기반 이동: 각 입력 명령을 클라이언트가 보낸 dt 그대로 재현해
    // 서버 위치가 클라 예측과 결정론적으로 일치하도록 한다(재조정의 전제).
    this.onMessage("input", (client, payload) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !isClientInput(payload)) {
        return;
      }

      // 비정상/과도한 이동을 막기 위해 dt를 상한으로 클램프한다.
      const dt = typeof payload.dt === "number" ? Math.min(Math.max(payload.dt, 0), MAX_INPUT_DT) : 0;
      if (dt > 0) {
        updatePlayerPosition(player, payload, dt);
      }

      // 마지막으로 처리한 입력 순번을 기록(클라가 이 기준으로 미처리 입력을 재적용).
      if (typeof payload.seq === "number" && payload.seq > player.lastSeq) {
        player.lastSeq = payload.seq;
      }
    });
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
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
  }
}
