import {
  diceBlastAt,
  directionToPosition,
  diceRolePosition,
  DICE_FIRE_MS,
  DICE_TOTAL_MS,
  getMissingGroupOneRoles,
  getMissingStrategyPositions,
  isPlayerRole,
  type DiceConfig,
  MISSING_CAST_MS,
  PLAYER_MOVE_SPEED,
  PLAYER_ROLES,
  TOWER_ACTIVATE_MS,
  TOWER_DISTANCE,
  TOWER_INTERVAL_MS,
  TOWER_ROUNDS,
  type MarkerType,
  type PlayerRole,
  type Vector2Like,
  sortMissingTowersByBossFacingLeftRight
} from "@raid-simulator/shared";
import type { RaidRoomState } from "../schemas/RaidRoomState.js";
import { PlayerSchema } from "../schemas/PlayerSchema.js";

type Vec2 = { x: number; z: number };

const BOT_PREFIX = "bot-";
// 플레이어와 동일한 속도. 첫 이동(먼 시작 대형 → 탑)도 락 시간 안에 도달하도록.
const BOT_SPEED = PLAYER_MOVE_SPEED;
const TOWER_POSITION_LOCK_MS = 1500;
const FIRST_MARKER_MOVE_DELAY_MS = 1000;
const WANDER_START_MS = MISSING_CAST_MS + FIRST_MARKER_MOVE_DELAY_MS;
const KICK_BAIT_HOLD_MS = 3400;
const KICK_BAIT_DISTANCE = 7;

const BOT_INITIAL_POSITIONS: Record<PlayerRole, Vec2> = {
  MT: { x: -4.5, z: 12.5 },
  ST: { x: -1.5, z: 12.5 },
  D1: { x: 1.5, z: 12.5 },
  D2: { x: 4.5, z: 12.5 },
  H1: { x: -4.5, z: 15.5 },
  H2: { x: -1.5, z: 15.5 },
  D3: { x: 1.5, z: 15.5 },
  D4: { x: 4.5, z: 15.5 }
};

export class BotController {
  private active = false;
  private groupOneRoles: PlayerRole[] | null = null;
  // 라운드 시작(=직전 판정) 시점의 위치 스냅샷. 좌/우 배정이 매 프레임 흔들리지 않게 고정한다.
  private sideSnapshot: { round: number; positions: Partial<Record<PlayerRole, Vec2>> } | null = null;

  constructor(private readonly state: RaidRoomState) {}

  isActive(): boolean {
    return this.active;
  }

  startPracticeFill() {
    this.active = true;
    this.ensureBots();
    this.groupOneRoles = null;
    this.sideSnapshot = null;
    this.state.players.forEach((player) => {
      if (!isPlayerRole(player.role)) {
        return;
      }
      const position = BOT_INITIAL_POSITIONS[player.role];
      player.x = position.x;
      player.z = position.z;
      player.rotation = Math.PI;
      player.lastSeq = 0;
    });
  }

  stop() {
    this.active = false;
    this.groupOneRoles = null;
    this.sideSnapshot = null;
    this.removeAllBots();
  }

  ensureBots() {
    if (this.humanCount() === 0) {
      this.stop();
      return;
    }

    for (const role of PLAYER_ROLES) {
      const existing = this.findPlayerByRole(role);
      if (existing) {
        continue;
      }

      const initial = BOT_INITIAL_POSITIONS[role];
      const bot = new PlayerSchema();
      bot.id = botId(role);
      bot.name = `${role} Bot`;
      bot.role = role;
      bot.x = initial.x;
      bot.z = initial.z;
      bot.rotation = Math.PI;
      this.state.players.set(bot.id, bot);
    }
  }

  removeBotForRole(role: PlayerRole) {
    this.deleteBot(role);
  }

  update(deltaMs: number) {
    if (!this.active) {
      return;
    }
    if (this.humanCount() === 0) {
      this.stop();
      return;
    }

    this.ensureBots();
    const deltaSeconds = Math.max(0, deltaMs / 1000);
    // 전략 위치는 프레임당 한 번만 계산해 8개 봇이 공유한다(서버 부하 절감).
    const strategy = this.computeStrategyPositions();
    for (const role of PLAYER_ROLES) {
      const bot = this.state.players.get(botId(role));
      if (!bot) {
        continue;
      }

      if (this.state.gimmickPhase === "running" && this.state.elapsed < WANDER_START_MS) {
        continue;
      }

      const mechanicTarget = this.getTarget(role, strategy);
      if (this.shouldMoveToMechanicPosition(bot, mechanicTarget)) {
        moveToward(bot, mechanicTarget, deltaSeconds);
      }
    }
  }

  // P3 주사위: 연두 장판까지는 정답 동선, 이후엔 우왕좌왕, #9~16 시점에 주사위 자리 도착.
  updateDice(deltaMs: number, config: DiceConfig) {
    if (!this.active) {
      return;
    }
    if (this.humanCount() === 0) {
      this.stop();
      return;
    }
    this.ensureBots();
    const deltaSeconds = Math.max(0, deltaMs / 1000);
    const t = this.state.elapsed;
    const wanderUntil = diceBlastAt(6) + 1000; // 연두 장판 직후까지는 정답 동선
    const arriveAt = DICE_FIRE_MS - 3500; // 직행 시작(판정 전 안전하게 도착하도록)
    for (const role of PLAYER_ROLES) {
      const bot = this.state.players.get(botId(role));
      if (!bot) {
        continue;
      }
      let target: Vec2;
      if (t < wanderUntil) {
        target = diceRolePosition(role, t, config); // 집결→넉백→중앙 쉐어
      } else if (t < arriveAt) {
        target = wanderPoint(role, t); // 우왕좌왕
      } else {
        target = diceRolePosition(role, DICE_TOTAL_MS, config); // 최종 주사위 자리로 직행
      }
      moveToward(bot, target, deltaSeconds);
    }
  }

  private computeStrategyPositions(): Record<PlayerRole, Vec2> | null {
    const towers = getCurrentTowers(this.state);
    if (this.state.gimmickPhase !== "running" || !towers || this.state.round === 0) {
      return null;
    }
    const [left, right] = towers;
    const currentMarkers = getMarkersByRole(this.state);
    const groupOneRoles = this.getGroupOneRoles(currentMarkers);
    // 좌/우 배정은 라운드 시작 시점(직전 판정 위치)에서 한 번 고정한 스냅샷으로 계산한다.
    if (!this.sideSnapshot || this.sideSnapshot.round !== this.state.round) {
      this.sideSnapshot = { round: this.state.round, positions: getPositionsByRole(this.state) };
    }
    return getMissingStrategyPositions({
      round: this.state.round,
      leftTower: left,
      rightTower: right,
      markers: currentMarkers,
      currentPositions: this.sideSnapshot.positions,
      groupOneRoles,
      markerCounts: getMarkerCountsByRole(this.state),
      priorityMarkers: getPriorityMarkersByRole(this.state)
    }) as Record<PlayerRole, Vec2>;
  }

  private getTarget(role: PlayerRole, strategy: Record<PlayerRole, Vec2> | null): Vec2 {
    if (!strategy) {
      return BOT_INITIAL_POSITIONS[role];
    }
    const kickBait = this.getKickBaitTarget(role);
    if (kickBait) {
      return kickBait;
    }
    return strategy[role];
  }

  private getGroupOneRoles(markers: Partial<Record<PlayerRole, MarkerType>>): PlayerRole[] {
    if (this.groupOneRoles) {
      return this.groupOneRoles;
    }

    const nextGroupOneRoles = getMissingGroupOneRoles(markers);
    if (nextGroupOneRoles.length === 4) {
      this.groupOneRoles = nextGroupOneRoles;
      return nextGroupOneRoles;
    }

    return PLAYER_ROLES.slice(0, 4);
  }

  private findPlayerByRole(role: PlayerRole): PlayerSchema | undefined {
    for (const player of this.state.players.values()) {
      if (player.role === role) {
        return player;
      }
    }
    return undefined;
  }

  private humanCount(): number {
    let count = 0;
    for (const id of this.state.players.keys()) {
      if (!isBotId(id)) count += 1;
    }
    return count;
  }

  private removeAllBots() {
    for (const role of PLAYER_ROLES) {
      this.deleteBot(role);
    }
  }

  private deleteBot(role: PlayerRole) {
    const id = botId(role);
    if (this.state.players.has(id)) {
      this.state.players.delete(id);
    }
  }

  private shouldMoveToMechanicPosition(bot: PlayerSchema, target: Vec2): boolean {
    if (this.state.gimmickPhase !== "running" || this.state.round <= 0) {
      return false;
    }

    if (this.getKickBaitTarget(bot.role as PlayerRole)) {
      return true;
    }

    const activateAt = MISSING_CAST_MS + (this.state.round - 1) * TOWER_INTERVAL_MS + TOWER_ACTIVATE_MS;
    const lockAt = activateAt - TOWER_POSITION_LOCK_MS;
    const timeToLockSeconds = Math.max(0, (lockAt - this.state.elapsed) / 1000);
    const travelSeconds = Math.hypot(target.x - bot.x, target.z - bot.z) / BOT_SPEED;
    return this.state.elapsed >= lockAt || travelSeconds >= timeToLockSeconds;
  }

  private getKickBaitTarget(role: PlayerRole): Vec2 | null {
    const round = getActiveKickBaitRound(this.state.elapsed);
    if (!round) {
      return null;
    }

    const activateAt = MISSING_CAST_MS + (round - 1) * TOWER_INTERVAL_MS + TOWER_ACTIVATE_MS;
    const baitStartAt = activateAt + 1000;
    const baitEndAt = baitStartAt + KICK_BAIT_HOLD_MS;
    if (this.state.elapsed < baitStartAt || this.state.elapsed > baitEndAt) {
      return null;
    }

    const nextTowers = getTowerPairByRound(this.state, round + 1);
    const towerMid = scale(add(nextTowers[0], nextTowers[1]), 0.5);
    const baitDirection = getEvenRoundCast(this.state) === "past" ? normalize(towerMid) : scale(normalize(towerMid), -1);
    return add(scale(baitDirection, KICK_BAIT_DISTANCE), spreadOffset(role));
  }
}

export function isBotId(id: string): boolean {
  return id.startsWith(BOT_PREFIX);
}

export function botId(role: PlayerRole): string {
  return `${BOT_PREFIX}${role}`;
}

// 주사위 기믹: 연두 장판 이후 중앙 부근에서 사인파로 우왕좌왕.
function wanderPoint(role: PlayerRole, t: number): Vec2 {
  const idx = PLAYER_ROLES.indexOf(role);
  const phase = idx * 0.9;
  return {
    x: Math.sin(t / 600 + phase) * 6 + Math.cos(t / 360 + phase) * 2.5,
    z: Math.cos(t / 520 + phase) * 6 + Math.sin(t / 410 + phase) * 2.5
  };
}

function moveToward(player: PlayerSchema, target: Vector2Like, deltaSeconds: number) {
  const dx = target.x - player.x;
  const dz = target.z - player.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= 0.001) {
    player.x = target.x;
    player.z = target.z;
    return;
  }

  const step = Math.min(distance, BOT_SPEED * deltaSeconds);
  player.x += (dx / distance) * step;
  player.z += (dz / distance) * step;
  player.rotation = Math.atan2(dx, dz);
}

function getCurrentTowers(state: RaidRoomState): [Vec2, Vec2] | null {
  const towers: Vec2[] = [];
  state.towers.forEach((tower) => towers.push({ x: tower.x, z: tower.z }));
  if (towers.length < 2 || !towers[0] || !towers[1]) {
    return null;
  }
  return sortTowersByBossFacingLeftRight(towers[0], towers[1]);
}

function getMarkersByRole(state: RaidRoomState): Partial<Record<PlayerRole, MarkerType>> {
  const markers: Partial<Record<PlayerRole, MarkerType>> = {};
  state.players.forEach((player) => {
    if (isPlayerRole(player.role) && (player.marker === "share" || player.marker === "spread" || player.marker === "cone")) {
      markers[player.role] = player.marker;
    }
  });
  return markers;
}

function getPositionsByRole(state: RaidRoomState): Partial<Record<PlayerRole, Vec2>> {
  const positions: Partial<Record<PlayerRole, Vec2>> = {};
  state.players.forEach((player) => {
    if (isPlayerRole(player.role)) {
      positions[player.role] = { x: player.x, z: player.z };
    }
  });
  return positions;
}

function getMarkerCountsByRole(state: RaidRoomState): Partial<Record<PlayerRole, number>> {
  const markerCounts: Partial<Record<PlayerRole, number>> = {};
  state.players.forEach((player) => {
    if (isPlayerRole(player.role)) {
      markerCounts[player.role] = player.markerCount;
    }
  });
  return markerCounts;
}

function getPriorityMarkersByRole(state: RaidRoomState) {
  const priorityMarkers: Partial<Record<PlayerRole, "number1" | "number2" | "forbid1" | "forbid2">> = {};
  state.players.forEach((player) => {
    if (
      isPlayerRole(player.role) &&
      (player.priorityMarker === "number1" ||
        player.priorityMarker === "number2" ||
        player.priorityMarker === "forbid1" ||
        player.priorityMarker === "forbid2")
    ) {
      priorityMarkers[player.role] = player.priorityMarker;
    }
  });
  return priorityMarkers;
}

function sortTowersByBossFacingLeftRight(a: Vec2, b: Vec2): [Vec2, Vec2] {
  return sortMissingTowersByBossFacingLeftRight(a, b);
}

function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, z: a.z + b.z };
}

function scale(a: Vec2, amount: number): Vec2 {
  return { x: a.x * amount, z: a.z * amount };
}

function normalize(a: Vec2): Vec2 {
  const length = Math.hypot(a.x, a.z) || 1;
  return { x: a.x / length, z: a.z / length };
}

function getActiveKickBaitRound(elapsed: number): number | null {
  for (let round = 2; round < TOWER_ROUNDS; round += 2) {
    const activateAt = MISSING_CAST_MS + (round - 1) * TOWER_INTERVAL_MS + TOWER_ACTIVATE_MS;
    const baitStartAt = activateAt + 1000;
    const baitEndAt = baitStartAt + KICK_BAIT_HOLD_MS;
    if (elapsed >= baitStartAt && elapsed <= baitEndAt) {
      return round;
    }
  }
  return null;
}

function getTowerPairByRound(state: RaidRoomState, round: number): [Vec2, Vec2] {
  const base = state.missingBaseIndex;
  const shift = (round - 1) * state.missingRotationDirection;
  const first = directionToPosition(base + shift, TOWER_DISTANCE);
  const second = directionToPosition(base + 2 + shift, TOWER_DISTANCE);
  return sortTowersByBossFacingLeftRight(first, second);
}

function getEvenRoundCast(state: RaidRoomState): "future" | "past" {
  return state.lastEvenBossCast === "past" ? "past" : "future";
}

function spreadOffset(role: PlayerRole): Vec2 {
  const offsets: Record<PlayerRole, Vec2> = {
    MT: { x: -0.9, z: -0.45 },
    ST: { x: -0.9, z: -0.45 },
    H1: { x: -0.3, z: 0.45 },
    H2: { x: -0.3, z: 0.45 },
    D1: { x: 0.3, z: -0.45 },
    D2: { x: 0.3, z: -0.45 },
    D3: { x: 0.9, z: 0.45 },
    D4: { x: 0.9, z: 0.45 }
  };
  return offsets[role];
}
