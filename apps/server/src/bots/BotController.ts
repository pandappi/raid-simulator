import {
  BOSS_RADIUS,
  directionToPosition,
  isPlayerRole,
  MISSING_CAST_MS,
  PLAYER_ROLES,
  TOWER_ACTIVATE_MS,
  TOWER_DISTANCE,
  TOWER_INTERVAL_MS,
  TOWER_RADIUS,
  TOWER_ROUNDS,
  type MarkerType,
  type PlayerRole,
  type Vector2Like
} from "@raid-simulator/shared";
import type { RaidRoomState } from "../schemas/RaidRoomState.js";
import { PlayerSchema } from "../schemas/PlayerSchema.js";

type Vec2 = { x: number; z: number };
type BotGroup = 1 | 2;

const BOT_PREFIX = "bot-";
const BOT_SPEED = 3.8;
const TOWER_POSITION_LOCK_MS = 1500;
const WANDER_RADIUS = 2.2;
const WANDER_START_MS = MISSING_CAST_MS;
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
const GROUP_BY_ROLE: Record<PlayerRole, BotGroup> = {
  MT: 1,
  H1: 1,
  D2: 1,
  D4: 1,
  ST: 2,
  H2: 2,
  D1: 2,
  D3: 2
};
export class BotController {
  private wanderStates = new Map<PlayerRole, { center: Vec2; radiusX: number; radiusZ: number; phase: number; speed: number }>();

  constructor(private readonly state: RaidRoomState) {}

  ensureBots() {
    if (this.humanCount() === 0) {
      this.removeAllBots();
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
      this.state.players.set(bot.id, bot);
    }
  }

  removeBotForRole(role: PlayerRole) {
    this.deleteBot(role);
  }

  prepareForFillStart() {
    this.ensureBots();
    this.wanderStates.clear();
    this.state.players.forEach((player) => {
      if (!isPlayerRole(player.role)) {
        return;
      }
      const position = BOT_INITIAL_POSITIONS[player.role];
      player.x = position.x;
      player.z = position.z;
      player.rotation = Math.PI;
    });
  }

  update(deltaMs: number) {
    if (this.humanCount() === 0) {
      this.removeAllBots();
      return;
    }

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

    const activeGroup = isGroupOneRound(this.state.round) ? 1 : 2;
    const roleGroup = GROUP_BY_ROLE[role];
    const currentMarkers = getMarkersByRole(this.state);
    const marker = currentMarkers[role] ?? "";

    if (roleGroup === activeGroup) {
      return this.state.round % 2 === 1
        ? oddTowerTarget(role, marker, activeGroup, left, right, currentMarkers)
        : evenTowerTarget(role, marker, activeGroup, left, right, currentMarkers);
    }

    return inactiveTarget(role, this.state.round, left, right);
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

function oddTowerTarget(
  role: PlayerRole,
  marker: MarkerType | "",
  activeGroup: BotGroup,
  left: Vec2,
  right: Vec2,
  markers: Partial<Record<PlayerRole, MarkerType>>
): Vec2 {
  if (marker === "share") {
    return role === firstRoleWithMarker(activeGroup, markers, "share") ? towerPoint(left, "center") : towerPoint(right, "inner");
  }
  if (marker === "spread") return towerPoint(right, "outer");
  if (marker === "cone") return towerPoint(left, "outerEdge");
  return towerPoint(right, "inner");
}

function evenTowerTarget(
  role: PlayerRole,
  marker: MarkerType | "",
  activeGroup: BotGroup,
  left: Vec2,
  right: Vec2,
  markers: Partial<Record<PlayerRole, MarkerType>>
): Vec2 {
  const leftCone = bossTowerSideIntersection(left, "left");
  const rightCone = bossTowerSideIntersection(right, "right");
  if (marker === "cone") {
    return role === firstRoleWithMarker(activeGroup, markers, "cone") ? leftCone : rightCone;
  }
  if (marker === "spread") {
    return role === firstRoleWithMarker(activeGroup, markers, "spread")
      ? towerClockPoint(left, leftCone, 6, false)
      : towerClockPoint(right, rightCone, 6, false);
  }
  if (marker === "share") return towerClockPoint(left, leftCone, 6, false);
  return towerClockPoint(right, rightCone, 6, false);
}

function firstRoleWithMarker(
  group: BotGroup,
  markers: Partial<Record<PlayerRole, MarkerType>>,
  marker: MarkerType
): PlayerRole | undefined {
  return PLAYER_ROLES.find((role) => GROUP_BY_ROLE[role] === group && markers[role] === marker);
}

function inactiveTarget(role: PlayerRole, round: number, left: Vec2, right: Vec2): Vec2 {
  const between = normalize(scale(add(left, right), 0.5));
  if (round % 2 === 1) {
    if (role === "MT" || role === "ST") return betweenTowersAtCenterDistance(left, right, 5, 0.01);
    if (role.startsWith("D")) return betweenTowersAtCenterDistance(right, left, 4);
    return towerPoint(left, "healerOuterOutside");
  }

  if (role === "MT" || role === "ST") return bossClockPointFromSix(between, 11);
  if (role === "D1" || role === "D2") return bossClockPointFromSix(between, 1);

  const leftCone = bossTowerSideIntersection(left, "left");
  const rightCone = bossTowerSideIntersection(right, "right");
  if (role === "H1" || role === "H2") return towerClockPoint(left, leftCone, 9, true, 0.75);
  return towerClockPoint(right, rightCone, 3, true);
}

function isGroupOneRound(round: number): boolean {
  return round === 1 || round === 2 || round === 3 || round === 8;
}

function sortTowersByBossFacingLeftRight(a: Vec2, b: Vec2): [Vec2, Vec2] {
  const midpoint = scale(add(a, b), 0.5);
  const forwardToBoss = normalize(scale(midpoint, -1));
  const leftSide = { x: -forwardToBoss.z, z: forwardToBoss.x };
  return dot(a, leftSide) < dot(b, leftSide) ? [a, b] : [b, a];
}

function towerPoint(tower: Vec2, point: "center" | "inner" | "outer" | "outerEdge" | "healerOuterOutside"): Vec2 {
  const inward = normalize({ x: -tower.x, z: -tower.z });
  const outward = scale(inward, -1);
  if (point === "center") return tower;
  if (point === "inner") return add(tower, scale(inward, 1.6));
  if (point === "outer") return add(tower, scale(outward, 2.2));
  if (point === "outerEdge") return add(tower, scale(outward, TOWER_RADIUS - 0.05));
  return add(tower, scale(outward, TOWER_RADIUS + 0.7));
}

function bossClockPointFromSix(sixDirection: Vec2, hour: 1 | 11): Vec2 {
  const six = normalize(sixDirection);
  const twelve = scale(six, -1);
  const right = { x: -twelve.z, z: twelve.x };
  const amount = Math.PI / 6;
  const sign = hour === 1 ? 1 : -1;
  const direction = add(scale(twelve, Math.cos(amount)), scale(right, Math.sin(amount) * sign));
  return scale(normalize(direction), BOSS_RADIUS + 0.35);
}

function bossTowerSideIntersection(tower: Vec2, sideName: "left" | "right"): Vec2 {
  const [a, b] = bossTowerIntersections(tower);
  const forwardToBoss = normalize(scale(tower, -1));
  const leftSide = { x: -forwardToBoss.z, z: forwardToBoss.x };
  return sideName === "left" ? (dot(a, leftSide) < dot(b, leftSide) ? a : b) : dot(a, leftSide) > dot(b, leftSide) ? a : b;
}

function bossTowerIntersections(tower: Vec2): [Vec2, Vec2] {
  const distance = Math.hypot(tower.x, tower.z);
  const fromBoss = normalize(tower);
  const side = normalize({ x: -fromBoss.z, z: fromBoss.x });
  const along = (BOSS_RADIUS * BOSS_RADIUS - TOWER_RADIUS * TOWER_RADIUS + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, BOSS_RADIUS * BOSS_RADIUS - along * along));
  return [add(scale(fromBoss, along), scale(side, height)), add(scale(fromBoss, along), scale(side, -height))];
}

function towerClockPoint(tower: Vec2, twelvePoint: Vec2, hour: 3 | 6 | 9, outside: boolean, outsideGap = 0.45): Vec2 {
  const twelve = normalize({ x: twelvePoint.x - tower.x, z: twelvePoint.z - tower.z });
  const right = { x: -twelve.z, z: twelve.x };
  const radius = outside ? TOWER_RADIUS + outsideGap : TOWER_RADIUS - 0.35;
  if (hour === 3) return add(tower, scale(right, radius));
  if (hour === 9) return add(tower, scale(right, -radius));
  return add(tower, scale(twelve, -radius));
}

function betweenTowersAtCenterDistance(anchorTower: Vec2, otherTower: Vec2, centerDistance: number, towerGap = 0.45): Vec2 {
  const intersections = circleIntersections({ x: 0, z: 0 }, centerDistance, anchorTower, TOWER_RADIUS + towerGap);
  if (intersections.length === 0) return scale(normalize(add(anchorTower, otherTower)), centerDistance);
  return intersections.reduce((best, point) => (distance2D(point, otherTower) < distance2D(best, otherTower) ? point : best));
}

function circleIntersections(a: Vec2, radiusA: number, b: Vec2, radiusB: number): Vec2[] {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const distance = Math.hypot(dx, dz);
  if (distance === 0 || distance > radiusA + radiusB || distance < Math.abs(radiusA - radiusB)) return [];
  const along = (radiusA * radiusA - radiusB * radiusB + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, radiusA * radiusA - along * along));
  const unit = { x: dx / distance, z: dz / distance };
  const base = { x: a.x + along * unit.x, z: a.z + along * unit.z };
  const offset = { x: -unit.z * height, z: unit.x * height };
  return [add(base, offset), add(base, scale(offset, -1))];
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

function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.z * b.z;
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
