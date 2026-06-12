import colyseus, { type Client } from "colyseus";
import {
  IDLE_DISCONNECT_MS,
  isPlayerRole,
  MAX_INPUT_DT,
  MAX_ROOMS,
  ROOM_LIFETIME_MS,
  type JoinOptions,
  type PlayerRole
} from "@raid-simulator/shared";
import { PlayerSchema } from "../schemas/PlayerSchema.js";
import { RaidRoomState } from "../schemas/RaidRoomState.js";
import { isClientInput, ROLE_INITIAL_POSITIONS, updatePlayerPosition } from "../utils/movement.js";
import { validateJoinOptions } from "../utils/validateJoinOptions.js";
import { GimmickController } from "../gimmick/GimmickController.js";
import { BotController, isBotId } from "../bots/BotController.js";

const { Room } = colyseus;

// 기믹 타임라인 진행용 틱 간격(ms). 이동은 명령 기반이라 이 틱은 시간 진행에만 쓴다.
const GIMMICK_TICK_MS = 50;
const IDLE_TIMEOUT_MS = IDLE_DISCONNECT_MS;
const ROOM_EXPIRED_CODE = 4001;

// 동시에 살아있는 방 수(생성 한도 체크용).
let activeRoomCount = 0;

export class RaidRoom extends Room<RaidRoomState> {
  private gimmick!: GimmickController;
  private bots!: BotController;
  private lastInputAtByClient = new Map<string, number>();
  private counted = false;
  private roomAgeMs = 0;
  private expired = false;

  onCreate() {
    // 방 수 한도: 30개 초과면 생성 거부.
    if (activeRoomCount >= MAX_ROOMS) {
      throw new Error("현재 생성된 방이 가득 찼습니다(최대 30개). 잠시 후 다시 시도해주세요.");
    }
    activeRoomCount += 1;
    this.counted = true;
    srvLog("방생성", `id=${this.roomId} | 방수=${activeRoomCount}/${MAX_ROOMS}`);

    this.maxClients = 8;
    // 비공개 방: 자동 매칭(joinOrCreate)으로 섞이지 않고, 방 코드(roomId)로만 입장.
    this.setPrivate(true);
    this.setState(new RaidRoomState());
    this.state.roomRemainingSec = Math.ceil(ROOM_LIFETIME_MS / 1000);
    this.gimmick = new GimmickController(this.state);
    this.bots = new BotController(this.state);

    // 명령 기반 이동: 각 입력 명령을 클라이언트가 보낸 dt 그대로 재현해
    // 서버 위치가 클라 예측과 결정론적으로 일치하도록 한다(재조정의 전제).
    this.onMessage("input", (client, payload) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !isClientInput(payload)) {
        return;
      }
      this.lastInputAtByClient.set(client.sessionId, Date.now());

      // 실패로 중단된 상태에서는 모든 이동 입력을 무시한다(컨트롤 정지).
      if (this.state.controlsLocked) {
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

    // 기믹 제어: 누구나 시작/중단/일시정지/재개할 수 있다.
    this.onMessage("gimmick", (_client, payload) => {
      if (!isRecord(payload)) {
        return;
      }
      const action = payload.action;
      const gimmick = typeof payload.gimmick === "string" ? payload.gimmick : "missing";
      const stopOnFailure = payload.stopOnFailure === true;
      if (action === "start") {
        this.bots.stop();
        this.gimmick.start(gimmick, { stopOnFailure });
      } else if (action === "practiceStart") {
        this.bots.startPracticeFill();
        this.gimmick.start(gimmick, { stopOnFailure });
      } else if (action === "stop") {
        this.gimmick.stop();
        this.bots.stop();
      } else if (action === "pause") {
        this.gimmick.pause();
      } else if (action === "resume") {
        this.gimmick.resume();
      }
    });

    // 시뮬레이터 안에서 역할군 변경(진행 중에는 불가).
    this.onMessage("setRole", (client, payload) => {
      if (this.state.gimmickPhase === "running") {
        return;
      }
      if (!isRecord(payload) || !isPlayerRole(payload.role)) {
        return;
      }
      const role = payload.role as PlayerRole;
      const player = this.state.players.get(client.sessionId);
      if (!player || player.role === role) {
        return;
      }
      // 다른 '사람'이 이미 그 역할이면 거부(봇이 점유 중이면 봇을 비운다).
      for (const [id, other] of this.state.players.entries()) {
        if (id !== client.sessionId && !isBotId(id) && other.role === role) {
          return;
        }
      }
      this.bots.removeBotForRole(role);
      player.role = role;
      const position = ROLE_INITIAL_POSITIONS[role];
      player.x = position.x;
      player.z = position.z;
      player.rotation = Math.PI;
      player.lastSeq = 0;
      player.marker = "";
      player.markerVisible = false;
      player.priorityMarker = "";
      player.markerCount = 0;
    });

    // 기믹 타임라인 진행.
    this.setSimulationInterval((dt) => {
      if (!this.state.paused && this.state.gimmickPhase === "running") {
        const diceConfig = this.gimmick.getDiceConfig();
        if (diceConfig) {
          this.bots.updateDice(dt, diceConfig);
        } else {
          this.bots.update(dt);
        }
      }
      this.gimmick.update(dt);
      this.updateRoomLifetime(dt);
      this.disconnectIdleClients();
    }, GIMMICK_TICK_MS);
  }

  onAuth(_client: Client, options: unknown) {
    return validateJoinOptions(options, this.state);
  }

  onJoin(client: Client, options: unknown, auth?: JoinOptions) {
    const joinOptions = auth ?? validateJoinOptions(options, this.state);
    const initialPosition = ROLE_INITIAL_POSITIONS[joinOptions.role];
    this.bots.removeBotForRole(joinOptions.role);

    const player = new PlayerSchema();
    player.id = client.sessionId;
    player.name = joinOptions.name;
    player.role = joinOptions.role;
    player.x = initialPosition.x;
    player.z = initialPosition.z;

    this.state.players.set(client.sessionId, player);
    this.lastInputAtByClient.set(client.sessionId, Date.now());
    srvLog(
      "입장",
      `id=${this.roomId} | 역할=${joinOptions.role} | 인원=${this.humanCount()}/8 | 방수=${activeRoomCount}/${MAX_ROOMS}`
    );
  }

  onLeave(client: Client) {
    const role = this.state.players.get(client.sessionId)?.role ?? "?";
    this.state.players.delete(client.sessionId);
    this.lastInputAtByClient.delete(client.sessionId);
    srvLog("퇴장", `id=${this.roomId} | 역할=${role} | 인원=${this.humanCount()}/8`);
  }

  onDispose() {
    this.lastInputAtByClient.clear();
    if (this.counted) {
      activeRoomCount -= 1;
      this.counted = false;
    }
    srvLog("방삭제", `id=${this.roomId} | 방수=${activeRoomCount}/${MAX_ROOMS}`);
  }

  private humanCount(): number {
    let count = 0;
    for (const id of this.state.players.keys()) {
      if (!isBotId(id)) count += 1;
    }
    return count;
  }

  // 방 수명(15분) 관리 + 남은 시간 표시. 만료 시 전원 연결 해제 → 빈 방은 자동 삭제(autoDispose).
  private updateRoomLifetime(dt: number) {
    if (this.expired) {
      return;
    }
    this.roomAgeMs += dt;
    const remaining = Math.max(0, Math.ceil((ROOM_LIFETIME_MS - this.roomAgeMs) / 1000));
    if (remaining !== this.state.roomRemainingSec) {
      this.state.roomRemainingSec = remaining;
    }
    if (this.roomAgeMs >= ROOM_LIFETIME_MS) {
      this.expired = true;
      srvLog("만료", `id=${this.roomId} | 15분 경과 — 연결 해제 ${this.clients.length}명`);
      for (const client of this.clients) {
        client.leave(ROOM_EXPIRED_CODE);
      }
    }
  }

  private disconnectIdleClients() {
    const now = Date.now();
    for (const client of this.clients) {
      const lastInputAt = this.lastInputAtByClient.get(client.sessionId) ?? now;
      if (now - lastInputAt >= IDLE_TIMEOUT_MS) {
        srvLog("유휴퇴장", `id=${this.roomId} | client=${client.sessionId.slice(0, 6)} | 3분 무입력`);
        client.leave(4000);
      }
    }
  }
}

// Render Logs에서 한눈에 보이도록 한글 태그로 통일. (타임스탬프는 Render가 자동 부착)
function srvLog(tag: string, detail: string) {
  console.log(`[${tag}] ${detail}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
