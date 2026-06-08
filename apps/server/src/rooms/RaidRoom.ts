import colyseus, { type Client } from "colyseus";
import { MAX_INPUT_DT, type JoinOptions } from "@raid-simulator/shared";
import { PlayerSchema } from "../schemas/PlayerSchema.js";
import { RaidRoomState } from "../schemas/RaidRoomState.js";
import { isClientInput, ROLE_INITIAL_POSITIONS, updatePlayerPosition } from "../utils/movement.js";
import { validateJoinOptions } from "../utils/validateJoinOptions.js";
import { GimmickController } from "../gimmick/GimmickController.js";

const { Room } = colyseus;

// 기믹 타임라인 진행용 틱 간격(ms). 이동은 명령 기반이라 이 틱은 시간 진행에만 쓴다.
const GIMMICK_TICK_MS = 50;

export class RaidRoom extends Room<RaidRoomState> {
  private gimmick!: GimmickController;

  onCreate() {
    this.maxClients = 8;
    this.setState(new RaidRoomState());
    this.gimmick = new GimmickController(this.state);

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

    // 기믹 제어: 누구나 시작/중지/재시작할 수 있다.
    this.onMessage("gimmick", (_client, payload) => {
      if (!isRecord(payload)) {
        return;
      }
      const action = payload.action;
      const gimmick = typeof payload.gimmick === "string" ? payload.gimmick : "missing";
      if (action === "start") {
        this.gimmick.start(gimmick);
      } else if (action === "stop") {
        this.gimmick.stop();
      } else if (action === "restart") {
        this.gimmick.restart(gimmick);
      }
    });

    // 기믹 타임라인 진행.
    this.setSimulationInterval((dt) => this.gimmick.update(dt), GIMMICK_TICK_MS);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
