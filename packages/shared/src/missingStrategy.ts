import {
  BOSS_RADIUS,
  TOWER_RADIUS,
  type MarkerType,
  type PriorityMarkerType
} from "./gimmick.js";
import { PLAYER_ROLES, type PlayerRole } from "./roles.js";
import type { Vector2Like } from "./types.js";

export type MissingTowerSide = "left" | "right";

export type MissingStrategyInput = {
  round: number;
  leftTower: Vector2Like;
  rightTower: Vector2Like;
  markers: Partial<Record<PlayerRole, MarkerType>>;
  currentPositions: Partial<Record<PlayerRole, Vector2Like>>;
  groupOneRoles: readonly PlayerRole[];
  markerCounts?: Partial<Record<PlayerRole, number>>;
  priorityMarkers?: Partial<Record<PlayerRole, PriorityMarkerType>>;
};

export const MISSING_INITIAL_POSITIONS: Record<PlayerRole, Vector2Like> = {
  MT: { x: -4.5, z: 12.5 },
  ST: { x: -1.5, z: 12.5 },
  D1: { x: 1.5, z: 12.5 },
  D2: { x: 4.5, z: 12.5 },
  H1: { x: -4.5, z: 15.5 },
  H2: { x: -1.5, z: 15.5 },
  D3: { x: 1.5, z: 15.5 },
  D4: { x: 4.5, z: 15.5 }
};

export const MISSING_SHARE_PAIRS: readonly (readonly [PlayerRole, PlayerRole])[] = [
  ["MT", "H1"],
  ["ST", "H2"],
  ["D1", "D3"],
  ["D2", "D4"]
];

const INITIAL_LEFT_PRIORITY: PlayerRole[] = ["H1", "H2", "MT", "ST", "D1", "D2", "D3", "D4"];
const INITIAL_RIGHT_PRIORITY = [...INITIAL_LEFT_PRIORITY].reverse();
const MARKER_ORDER: MarkerType[] = ["share", "cone", "spread"];
const WAYMARK_DISTANCE = 13;
const CIRCLE_WAYMARK_RADIUS = 1.35;
const WAYMARK_INNER_EDGE_DISTANCE = WAYMARK_DISTANCE - CIRCLE_WAYMARK_RADIUS;
const TOWER_INSIDE_EDGE_GAP = 0.3;

export function getMissingGroupOneRoles(markers: Partial<Record<PlayerRole, MarkerType>>): PlayerRole[] {
  return MISSING_SHARE_PAIRS.flatMap(([a, b]) => (markers[a] === "share" || markers[b] === "share" ? [a, b] : []));
}

export function getMissingActiveRolesForRound(round: number, groupOneRoles: readonly PlayerRole[]): PlayerRole[] {
  return isMissingGroupOneRound(round) ? [...groupOneRoles] : PLAYER_ROLES.filter((role) => !groupOneRoles.includes(role));
}

export function isMissingGroupOneRound(round: number): boolean {
  return round === 1 || round === 2 || round === 3 || round === 8;
}

export function getMissingStrategyPositions(input: MissingStrategyInput): Record<PlayerRole, Vector2Like> {
  const positions = { ...MISSING_INITIAL_POSITIONS };
  const activeRoles = getMissingActiveRolesForRound(input.round, input.groupOneRoles);
  const inactiveRoles = PLAYER_ROLES.filter((role) => !activeRoles.includes(role));
  const sideAssignments = buildMissingTowerSideAssignments(activeRoles, input);

  placeInactivePlayers(positions, inactiveRoles, input.leftTower, input.rightTower, input.round);
  if (input.round % 2 === 1) {
    placeOddTowerPlayers(positions, activeRoles, input.markers, sideAssignments, input.leftTower, input.rightTower);
  } else {
    placeEvenTowerPlayers(positions, activeRoles, input.markers, sideAssignments, input.leftTower, input.rightTower);
  }
  return positions;
}

export function getMissingStrategyTarget(role: PlayerRole, input: MissingStrategyInput): Vector2Like {
  return getMissingStrategyPositions(input)[role];
}

export function buildMissingTowerSideAssignments(
  roles: PlayerRole[],
  input: MissingStrategyInput
): Partial<Record<PlayerRole, MissingTowerSide>> {
  const assignments: Partial<Record<PlayerRole, MissingTowerSide>> = {};
  const counts: Record<MissingTowerSide, number> = { left: 0, right: 0 };
  const entries = roles
    .map((role) => ({
      role,
      marker: input.markers[role],
      position: input.currentPositions[role],
      markerCount: input.markerCounts?.[role] ?? 1
    }))
    .filter((entry): entry is { role: PlayerRole; marker: MarkerType; position: Vector2Like; markerCount: number } =>
      Boolean(entry.marker && entry.position)
    );

  const assign = (role: PlayerRole, preferred: MissingTowerSide) => {
    if (assignments[role]) return;
    const fallback = preferred === "left" ? "right" : "left";
    const side = counts[preferred] < 2 ? preferred : fallback;
    assignments[role] = side;
    counts[side] += 1;
  };

  if (input.round === 8 && input.priorityMarkers) {
    for (const entry of entries) {
      const priorityMarker = input.priorityMarkers[entry.role];
      if (entry.marker === "cone" && priorityMarker === "number1") assign(entry.role, "left");
      if (entry.marker === "cone" && priorityMarker === "number2") assign(entry.role, "right");
      if (entry.marker === "spread" && priorityMarker === "forbid1") assign(entry.role, "left");
      if (entry.marker === "spread" && priorityMarker === "forbid2") assign(entry.role, "right");
    }
  }

  for (const marker of MARKER_ORDER) {
    const sameMarker = entries.filter((entry) => entry.marker === marker);
    if (sameMarker.length === 0) continue;

    const sorted = sortByPriority(sameMarker, INITIAL_LEFT_PRIORITY);
    if (sameMarker.length === 1) {
      const only = sorted[0];
      if (only) assign(only.role, sideWithRoom(counts));
      continue;
    }

    const initial = sameMarker.every((entry) => entry.markerCount <= 1);
    if (initial) {
      sorted.forEach((entry, index) => {
        assign(entry.role, index === 0 ? "left" : index === 1 ? "right" : sideWithRoom(counts));
      });
      continue;
    }

    const sideGroups = new Map<MissingTowerSide, typeof sameMarker>();
    for (const entry of sameMarker) {
      const side = currentTowerSide(entry.position, input.leftTower, input.rightTower);
      sideGroups.set(side, [...(sideGroups.get(side) ?? []), entry]);
    }

    for (const side of ["left", "right"] as const) {
      const groupEntries = sideGroups.get(side) ?? [];
      if (groupEntries.length === 0) continue;
      if (groupEntries.length === 1) {
        const only = groupEntries[0];
        if (only) assign(only.role, side);
        continue;
      }
      const opposite = side === "left" ? "right" : "left";
      // When the same marker is reassigned to both players in one tower,
      // the center-side player keeps this tower's priority and the outer player flips.
      const sortedByDistance = [...groupEntries].sort((a, b) => distanceToBoss(a.position) - distanceToBoss(b.position));
      sortedByDistance.forEach((entry, index) => {
        assign(entry.role, index === sortedByDistance.length - 1 ? opposite : side);
      });
    }
  }

  return assignments;
}

export function sortMissingTowersByBossFacingLeftRight<T extends Vector2Like>(a: T, b: T): [T, T] {
  const midpoint = scale(add(a, b), 0.5);
  const forwardToBoss = normalize(scale(midpoint, -1));
  const leftSide = { x: -forwardToBoss.z, z: forwardToBoss.x };
  return dot(a, leftSide) < dot(b, leftSide) ? [a, b] : [b, a];
}

function placeOddTowerPlayers(
  positions: Record<PlayerRole, Vector2Like>,
  activeRoles: PlayerRole[],
  markers: Partial<Record<PlayerRole, MarkerType>>,
  sideAssignments: Partial<Record<PlayerRole, MissingTowerSide>>,
  left: Vector2Like,
  right: Vector2Like
) {
  const shares = activeRoles.filter((role) => markers[role] === "share");
  // 좌/우는 짝수탑과 동일하게 sideAssignments(첫 부여=우선순위, 재지정=현재 탑 쪽) 사용.
  // 값이 없으면 역할군 우선순위로 폴백.
  const leftShare = shares.find((role) => sideAssignments[role] === "left") ?? firstByPriority(shares, INITIAL_LEFT_PRIORITY);
  const rightShare =
    shares.find((role) => role !== leftShare && sideAssignments[role] === "right") ??
    shares.find((role) => role !== leftShare);
  const cone = firstByPriority(activeRoles.filter((role) => markers[role] === "cone"), INITIAL_LEFT_PRIORITY);
  const spread = firstByPriority(activeRoles.filter((role) => markers[role] === "spread"), INITIAL_RIGHT_PRIORITY);

  if (leftShare) {
    positions[leftShare] = left;
  }
  if (cone) {
    positions[cone] = towerOuterInsidePoint(left);
  }
  const rightSharePoint = bossTowerIntersectionMidpoint(right);
  if (rightShare) {
    positions[rightShare] = rightSharePoint;
  }
  if (spread) {
    positions[spread] = farthestTowerInsidePoint(right, rightSharePoint);
  }
}

function placeEvenTowerPlayers(
  positions: Record<PlayerRole, Vector2Like>,
  activeRoles: PlayerRole[],
  markers: Partial<Record<PlayerRole, MarkerType>>,
  sideAssignments: Partial<Record<PlayerRole, MissingTowerSide>>,
  left: Vector2Like,
  right: Vector2Like
) {
  for (const side of ["left", "right"] as const) {
    const tower = side === "left" ? left : right;
    const conePoint = bossTowerSideIntersection(tower, side);
    const coneRole = activeRoles.find((role) => markers[role] === "cone" && sideAssignments[role] === side);
    const spreadRole = activeRoles.find((role) => markers[role] === "spread" && sideAssignments[role] === side);

    if (coneRole) {
      positions[coneRole] = moveToward(conePoint, tower, 0.2);
    }
    if (spreadRole) {
      positions[spreadRole] = farthestTowerInsidePoint(tower, conePoint);
    }
  }
}

function placeInactivePlayers(
  positions: Record<PlayerRole, Vector2Like>,
  roles: PlayerRole[],
  left: Vector2Like,
  right: Vector2Like,
  round: number
) {
  const between = normalize({ x: (left.x + right.x) / 2, z: (left.z + right.z) / 2 });
  const tanks = roles.filter((role) => role === "MT" || role === "ST");
  const healers = roles.filter((role) => role === "H1" || role === "H2");
  const melees = roles.filter((role) => role === "D1" || role === "D2");
  const rangeds = roles.filter((role) => role === "D3" || role === "D4");
  const dealers = roles.filter((role) => role.startsWith("D"));

  if (round % 2 === 1) {
    const tankSpot = betweenTowersAtCenterDistance(left, right, 8, 0.3);
    const dealerSpot = betweenTowersAtCenterDistance(right, left, 6, 0.3);
    for (const dealer of dealers) positions[dealer] = dealerSpot;
    for (const tank of tanks) positions[tank] = tankSpot;
    for (const healer of healers) positions[healer] = towerPoint(left, "healerOuterOutside");
    return;
  }

  for (const tank of tanks) positions[tank] = bossClockPointFromSix(between, 11);
  for (const melee of melees) positions[melee] = bossClockPointFromSix(between, 1);
  for (const healer of healers) positions[healer] = bossClockPointFromSix(between, 9, WAYMARK_INNER_EDGE_DISTANCE);
  for (const ranged of rangeds) positions[ranged] = bossClockPointFromSix(between, 3, WAYMARK_INNER_EDGE_DISTANCE);
}

function currentTowerSide(position: Vector2Like, left: Vector2Like, right: Vector2Like): MissingTowerSide {
  const midpoint = scale(add(left, right), 0.5);
  const forwardToBoss = normalize(scale(midpoint, -1));
  const leftAxis = { x: -forwardToBoss.z, z: forwardToBoss.x };
  return dot(position, leftAxis) < 0 ? "left" : "right";
}

function sideWithRoom(counts: Record<MissingTowerSide, number>): MissingTowerSide {
  return counts.left <= counts.right ? "left" : "right";
}

function sortByPriority<T extends { role: PlayerRole }>(entries: T[], priority: readonly PlayerRole[]): T[] {
  return [...entries].sort((a, b) => priority.indexOf(a.role) - priority.indexOf(b.role));
}

function firstByPriority(roles: PlayerRole[], priority: readonly PlayerRole[]): PlayerRole | undefined {
  return [...roles].sort((a, b) => priority.indexOf(a) - priority.indexOf(b))[0];
}

function towerOuterInsidePoint(tower: Vector2Like): Vector2Like {
  return add(tower, scale(normalize(tower), TOWER_RADIUS - TOWER_INSIDE_EDGE_GAP));
}

function farthestTowerInsidePoint(tower: Vector2Like, from: Vector2Like): Vector2Like {
  const away = normalize({ x: tower.x - from.x, z: tower.z - from.z });
  return add(tower, scale(away, TOWER_RADIUS - TOWER_INSIDE_EDGE_GAP));
}

function moveToward(from: Vector2Like, to: Vector2Like, amount: number): Vector2Like {
  const direction = normalize({ x: to.x - from.x, z: to.z - from.z });
  return add(from, scale(direction, amount));
}

function bossTowerIntersectionMidpoint(tower: Vector2Like): Vector2Like {
  const distance = Math.hypot(tower.x, tower.z);
  const fromBoss = normalize(tower);
  const along = (BOSS_RADIUS * BOSS_RADIUS - TOWER_RADIUS * TOWER_RADIUS + distance * distance) / (2 * distance);
  return scale(fromBoss, along);
}

function bossTowerSideIntersection(tower: Vector2Like, side: MissingTowerSide): Vector2Like {
  const [a, b] = bossTowerIntersections(tower);
  const forwardToBoss = normalize(scale(tower, -1));
  const leftSide = { x: -forwardToBoss.z, z: forwardToBoss.x };
  return side === "left" ? (dot(a, leftSide) < dot(b, leftSide) ? a : b) : dot(a, leftSide) > dot(b, leftSide) ? a : b;
}

function bossTowerIntersections(tower: Vector2Like): [Vector2Like, Vector2Like] {
  const midpoint = bossTowerIntersectionMidpoint(tower);
  const height = Math.sqrt(Math.max(0, BOSS_RADIUS * BOSS_RADIUS - Math.hypot(midpoint.x, midpoint.z) ** 2));
  const side = normalize({ x: -tower.z, z: tower.x });
  return [add(midpoint, scale(side, height)), add(midpoint, scale(side, -height))];
}

function towerPoint(tower: Vector2Like, point: "center" | "inner" | "outer" | "outerEdge" | "healerOuterOutside"): Vector2Like {
  const inward = normalize({ x: -tower.x, z: -tower.z });
  const outward = scale(inward, -1);
  if (point === "center") return tower;
  if (point === "inner") return add(tower, scale(inward, 3.5));
  if (point === "outer") return add(tower, scale(outward, 3.6));
  if (point === "outerEdge") return add(tower, scale(outward, TOWER_RADIUS - 0.45));
  return add(tower, scale(outward, TOWER_RADIUS + 0.9));
}

function bossClockPointFromSix(sixDirection: Vector2Like, hour: 1 | 3 | 9 | 11, distance = BOSS_RADIUS + 0.35): Vector2Like {
  const six = normalize(sixDirection);
  const twelve = scale(six, -1);
  const right = { x: -twelve.z, z: twelve.x };
  if (hour === 3) return scale(right, distance);
  if (hour === 9) return scale(right, -distance);
  const amount = Math.PI / 6;
  const sign = hour === 1 ? 1 : -1;
  const direction = add(scale(twelve, Math.cos(amount)), scale(right, Math.sin(amount) * sign));
  return scale(normalize(direction), distance);
}

function betweenTowersAtCenterDistance(anchorTower: Vector2Like, otherTower: Vector2Like, centerDistance: number, towerGap = 0.45): Vector2Like {
  const intersections = circleIntersections({ x: 0, z: 0 }, centerDistance, anchorTower, TOWER_RADIUS + towerGap);
  if (intersections.length === 0) return scale(normalize(add(anchorTower, otherTower)), centerDistance);
  return intersections.reduce((best, point) => (distance(point, otherTower) < distance(best, otherTower) ? point : best));
}

function circleIntersections(a: Vector2Like, radiusA: number, b: Vector2Like, radiusB: number): Vector2Like[] {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const d = Math.hypot(dx, dz);
  if (d === 0 || d > radiusA + radiusB || d < Math.abs(radiusA - radiusB)) return [];
  const along = (radiusA * radiusA - radiusB * radiusB + d * d) / (2 * d);
  const height = Math.sqrt(Math.max(0, radiusA * radiusA - along * along));
  const unit = { x: dx / d, z: dz / d };
  const base = { x: a.x + along * unit.x, z: a.z + along * unit.z };
  const offset = { x: -unit.z * height, z: unit.x * height };
  return [add(base, offset), add(base, scale(offset, -1))];
}

function distanceToBoss(point: Vector2Like): number {
  return Math.hypot(point.x, point.z);
}

function distance(a: Vector2Like, b: Vector2Like): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function add(a: Vector2Like, b: Vector2Like): Vector2Like {
  return { x: a.x + b.x, z: a.z + b.z };
}

function scale(a: Vector2Like, amount: number): Vector2Like {
  return { x: a.x * amount, z: a.z * amount };
}

function normalize(a: Vector2Like): Vector2Like {
  const length = Math.hypot(a.x, a.z) || 1;
  return { x: a.x / length, z: a.z / length };
}

function dot(a: Vector2Like, b: Vector2Like): number {
  return a.x * b.x + a.z * b.z;
}
