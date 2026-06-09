import {
  BOSS_RADIUS,
  TOWER_RADIUS,
  type MarkerType
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
const MARKER_ORDER: MarkerType[] = ["share", "cone", "spread"];
const MARKER_DEFAULT_SIDE: Record<MarkerType, MissingTowerSide> = {
  share: "left",
  cone: "left",
  spread: "right"
};

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
  placeActiveTowerPlayers(positions, activeRoles, input.markers, sideAssignments, input.leftTower, input.rightTower);
  placeSupportPlayers(positions, activeRoles, inactiveRoles, input.markers, sideAssignments, input.leftTower, input.rightTower);
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

  for (const marker of MARKER_ORDER) {
    const sameMarker = entries.filter((entry) => entry.marker === marker);
    if (sameMarker.length === 0) continue;

    const initial = sameMarker.every((entry) => entry.markerCount <= 1);
    if (initial) {
      const sorted = [...sameMarker].sort((a, b) => INITIAL_LEFT_PRIORITY.indexOf(a.role) - INITIAL_LEFT_PRIORITY.indexOf(b.role));
      sorted.forEach((entry, index) => {
        if (sameMarker.length === 1) {
          assign(entry.role, MARKER_DEFAULT_SIDE[marker]);
          return;
        }
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
      const sortedByDistance = [...groupEntries].sort((a, b) => distanceToBoss(a.position) - distanceToBoss(b.position));
      sortedByDistance.forEach((entry, index) => {
        assign(entry.role, index === sortedByDistance.length - 1 ? opposite : side);
      });
    }
  }

  for (const entry of entries) {
    assign(entry.role, MARKER_DEFAULT_SIDE[entry.marker]);
  }

  return assignments;
}

export function sortMissingTowersByBossFacingLeftRight<T extends Vector2Like>(a: T, b: T): [T, T] {
  const midpoint = scale(add(a, b), 0.5);
  const forwardToBoss = normalize(scale(midpoint, -1));
  const leftSide = { x: -forwardToBoss.z, z: forwardToBoss.x };
  return dot(a, leftSide) < dot(b, leftSide) ? [a, b] : [b, a];
}

function placeActiveTowerPlayers(
  positions: Record<PlayerRole, Vector2Like>,
  activeRoles: PlayerRole[],
  markers: Partial<Record<PlayerRole, MarkerType>>,
  sideAssignments: Partial<Record<PlayerRole, MissingTowerSide>>,
  left: Vector2Like,
  right: Vector2Like
) {
  for (const side of ["left", "right"] as const) {
    const tower = side === "left" ? left : right;
    const roles = activeRoles
      .filter((role) => sideAssignments[role] === side)
      .sort((a, b) => MARKER_ORDER.indexOf(markers[a] ?? "spread") - MARKER_ORDER.indexOf(markers[b] ?? "spread"));
    roles.forEach((role, index) => {
      positions[role] = towerOwnerPoint(tower, index);
    });
  }
}

function placeSupportPlayers(
  positions: Record<PlayerRole, Vector2Like>,
  activeRoles: PlayerRole[],
  inactiveRoles: PlayerRole[],
  markers: Partial<Record<PlayerRole, MarkerType>>,
  sideAssignments: Partial<Record<PlayerRole, MissingTowerSide>>,
  left: Vector2Like,
  right: Vector2Like
) {
  const freeRoles = [...inactiveRoles];
  const takeFreeRole = () => freeRoles.shift();

  for (const side of ["left", "right"] as const) {
    const tower = side === "left" ? left : right;
    const towerRoles = activeRoles
      .filter((role) => sideAssignments[role] === side)
      .sort((a, b) => MARKER_ORDER.indexOf(markers[a] ?? "spread") - MARKER_ORDER.indexOf(markers[b] ?? "spread"));

    towerRoles.forEach((role, index) => {
      if (markers[role] !== "share") return;
      for (let helperIndex = 0; helperIndex < 2; helperIndex++) {
        const helperRole = takeFreeRole();
        if (!helperRole) return;
        positions[helperRole] = towerSupportPoint(tower, index, helperIndex);
      }
    });
  }

  for (const side of ["left", "right"] as const) {
    const tower = side === "left" ? left : right;
    const towerRoles = activeRoles
      .filter((role) => sideAssignments[role] === side)
      .sort((a, b) => MARKER_ORDER.indexOf(markers[a] ?? "spread") - MARKER_ORDER.indexOf(markers[b] ?? "spread"));

    towerRoles.forEach((role, index) => {
      if (markers[role] !== "cone") return;
      const baitRole = takeFreeRole();
      if (!baitRole) return;
      positions[baitRole] = towerConeBaitPoint(tower, index);
    });
  }

  for (const role of freeRoles) {
    positions[role] = safeIdlePoint(role);
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
  for (const healer of healers) positions[healer] = bossClockPointFromSix(between, 9, 11.4);
  for (const ranged of rangeds) positions[ranged] = bossClockPointFromSix(between, 3, 11.4);
}

function towerOwnerPoint(tower: Vector2Like, slotIndex: number): Vector2Like {
  const radial = towerRadial(tower, slotIndex);
  return add(tower, scale(radial, TOWER_RADIUS - 0.55));
}

function towerSupportPoint(tower: Vector2Like, slotIndex: number, helperIndex: number): Vector2Like {
  const radial = towerRadial(tower, slotIndex);
  const tangent = { x: -radial.z, z: radial.x };
  const side = helperIndex === 0 ? -1 : 1;
  return add(tower, add(scale(radial, TOWER_RADIUS + 0.45), scale(tangent, side * 0.65)));
}

function towerConeBaitPoint(tower: Vector2Like, slotIndex: number): Vector2Like {
  const radial = towerRadial(tower, slotIndex);
  return add(tower, scale(radial, TOWER_RADIUS + 0.8));
}

function safeIdlePoint(role: PlayerRole): Vector2Like {
  const offsets: Record<PlayerRole, Vector2Like> = {
    MT: { x: -1.2, z: -0.8 },
    ST: { x: -0.4, z: -0.8 },
    H1: { x: 0.4, z: -0.8 },
    H2: { x: 1.2, z: -0.8 },
    D1: { x: -1.2, z: 0.8 },
    D2: { x: -0.4, z: 0.8 },
    D3: { x: 0.4, z: 0.8 },
    D4: { x: 1.2, z: 0.8 }
  };
  return offsets[role];
}

function towerRadial(tower: Vector2Like, slotIndex: number): Vector2Like {
  const outward = normalize(tower);
  return slotIndex % 2 === 0 ? outward : scale(outward, -1);
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

function towerPoint(tower: Vector2Like, point: "center" | "inner" | "outer" | "outerEdge" | "healerOuterOutside"): Vector2Like {
  const inward = normalize({ x: -tower.x, z: -tower.z });
  const outward = scale(inward, -1);
  if (point === "center") return tower;
  if (point === "inner") return add(tower, scale(inward, 3.5));
  if (point === "outer") return add(tower, scale(outward, 3.6));
  if (point === "outerEdge") return add(tower, scale(outward, TOWER_RADIUS - 0.45));
  return add(tower, scale(outward, TOWER_RADIUS + 0.7));
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
