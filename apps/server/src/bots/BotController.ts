import {
  directionToPosition,
  getMissingGroupOneRoles,
  getMissingStrategyTarget,
  isPlayerRole,
  MISSING_CAST_MS,
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
const BOT_SPEED = 3.8;
const TOWER_POSITION_LOCK_MS = 1500;
const WANDER_RADIUS = 2.2;
const FIRST_MARKER_MOVE_DELAY_MS = 1000;
const WANDER_START_MS = MISSING_CAST_MS + FIRST_MARKER_MOVE_DELAY_MS;
const KICK_BAIT_START_DELAY_MS = 1000;
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
  private wanderStates = new Map<PlayerRole, { center: Vec2; radiusX: number; radiusZ: number; phase: number; speed: number }>();

  constructor(private readonly state: RaidRoomState) {}

  isActive(): boolean {
    return this.active;
  }

  startPracticeFill() {
    this.active = true;
    this.ensureBots();
    this.groupOneRoles = null;
    this.wanderStates.clear();
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
    this.wanderStates.clear();
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
    for (const role of PLAYER_ROLES) {
      const bot = this.state.players.get(botId(role));
      if (!bot) {
        continue;
      }

      if (this.state.gimmickPhase === "running" && this.state.elapsed < WANDER_START_MS) {
        continue;
      }

      const mechanicTarget = this.getTarget(role);
      const target = this.shouldMoveToMechanicPosition(bot, mechanicTarget) ? mechanicTarget : this.getWanderTarget(bot, role);
      moveToward(bot, target, deltaSeconds);
    }
  }

  private getTarget(role: PlayerRole): Vec2 {
    const towers = getCurrentTowers(this.state);
    if (this.state.gimmickPhase !== "running" || !towers || this.state.round === 0) {
      return BOT_INITIAL_POSITIONS[role];
    }

    const [left, right] = towers;
    const kickBait = this.getKickBaitTarget(role);
    if (kickBait) {
      return kickBait;
    }

    const currentMarkers = getMarkersByRole(this.state);
    const groupOneRoles = this.getGroupOneRoles(currentMarkers);
    return getMissingStrategyTarget(role, {
      round: this.state.round,
      leftTower: left,
      rightTower: right,
      markers: currentMarkers,
      currentPositions: getPositionsByRole(this.state),
      groupOneRoles,
      markerCounts: getMarkerCountsByRole(this.state)
    });
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

  private getWanderTarget(bot: PlayerSchema, role: PlayerRole): Vec2 {
    const state = this.wanderStates.get(role);
    if (!state || distance2D(state.center, bot) > WANDER_RADIUS * 2.5) {
      const nextState = {
        center: { x: bot.x, z: bot.z },
        radiusX: 0.9 + Math.random() * 1.1,
        radiusZ: 0.6 + Math.random() * 0.9,
        phase: Math.random() * Math.PI * 2,
        speed: 0.55 + Math.random() * 0.35
      };
      this.wanderStates.set(role, nextState);
      return this.sampleWander(nextState);
    }

    return this.sampleWander(state);
  }

  private sampleWander(state: { center: Vec2; radiusX: number; radiusZ: number; phase: number; speed: number }): Vec2 {
    const t = (this.state.elapsed / 1000) * state.speed + state.phase;
    return clampToArena(
      {
        x: state.center.x + Math.sin(t) * state.radiusX,
        z: state.center.z + Math.sin(t * 0.73 + state.phase) * state.radiusZ
      },
      17
    );
  }

  private getKickBaitTarget(role: PlayerRole): Vec2 | null {
    const round = this.state.round;
    if (round <= 0 || round % 2 !== 0 || round >= TOWER_ROUNDS) {
      return null;
    }

    const activateAt = MISSING_CAST_MS + (round - 1) * TOWER_INTERVAL_MS + TOWER_ACTIVATE_MS;
    const baitStartAt = activateAt + KICK_BAIT_START_DELAY_MS;
    const baitEndAt = baitStartAt + KICK_BAIT_HOLD_MS;
    if (this.state.elapsed < baitStartAt || this.state.elapsed > baitEndAt) {
      return null;
    }

    const nextTowers = getTowerPairByRound(round + 1);
    const towerMid = scale(add(nextTowers[0], nextTowers[1]), 0.5);
    const baitDirection = getEvenRoundCast(round) === "past" ? normalize(towerMid) : scale(normalize(towerMid), -1);
    return add(scale(baitDirection, KICK_BAIT_DISTANCE), spreadOffset(role));
  }
}

export function isBotId(id: string): boolean {
  return id.startsWith(BOT_PREFIX);
}

export function botId(role: PlayerRole): string {
  return `${BOT_PREFIX}${role}`;
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

function distance2D(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function clampToArena(point: Vec2, maxDistance: number): Vec2 {
  const distance = Math.hypot(point.x, point.z);
  if (distance <= maxDistance || distance === 0) {
    return point;
  }
  return scale(normalize(point), maxDistance);
}

function getTowerPairByRound(round: number): [Vec2, Vec2] {
  const base = 3;
  const shift = round - 1;
  const first = directionToPosition(base + shift, TOWER_DISTANCE);
  const second = directionToPosition(base + 2 + shift, TOWER_DISTANCE);
  return sortTowersByBossFacingLeftRight(first, second);
}

function getEvenRoundCast(round: number): "future" | "past" {
  return round % 4 === 0 ? "future" : "past";
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
