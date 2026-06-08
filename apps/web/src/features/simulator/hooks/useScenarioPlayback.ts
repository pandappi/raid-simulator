import { useEffect, useRef } from "react";
import {
  AOE_SHOW_MS,
  ARENA_RADIUS,
  BOSS_RADIUS,
  BOSS_CAST_MS,
  CONE_ANGLE,
  CONE_RANGE,
  directionToPosition,
  MISSING_CAST_MS,
  SHARE_RADIUS,
  SPREAD_RADIUS,
  TOWER_ACTIVATE_MS,
  TOWER_DISTANCE,
  TOWER_INTERVAL_MS,
  TOWER_RADIUS,
  TOWER_ROUNDS,
  type MarkerType,
  type PlayerRole,
  type PlayerSnapshot
} from "@raid-simulator/shared";
import { getSelfState, ingestSnapshot, resetNetcode, setSelfId } from "../netcode";
import { useSimulatorStore, type AoeView, type TowerView } from "../stores/simulatorStore";

type Vec2 = { x: number; z: number };
type ScenarioPlayer = { id: string; name: string; role: PlayerRole; group: 1 | 2; marker: MarkerType };
type ScenarioFrame = {
  t: number;
  positions: Record<PlayerRole, Vec2>;
  markers: Partial<Record<PlayerRole, MarkerType>>;
};

const PLAYERS: ScenarioPlayer[] = [
  { id: "guide-mt", name: "MT", role: "MT", group: 1, marker: "share" },
  { id: "guide-st", name: "ST", role: "ST", group: 2, marker: "spread" },
  { id: "guide-h1", name: "H1", role: "H1", group: 1, marker: "spread" },
  { id: "guide-h2", name: "H2", role: "H2", group: 2, marker: "spread" },
  { id: "guide-d1", name: "D1", role: "D1", group: 2, marker: "cone" },
  { id: "guide-d2", name: "D2", role: "D2", group: 1, marker: "share" },
  { id: "guide-d3", name: "D3", role: "D3", group: 2, marker: "cone" },
  { id: "guide-d4", name: "D4", role: "D4", group: 1, marker: "cone" }
];

const INITIAL_MARKERS = Object.fromEntries(PLAYERS.map((player) => [player.role, player.marker])) as Record<PlayerRole, MarkerType>;
const POST_ROUND_MARKERS: Record<number, Partial<Record<PlayerRole, MarkerType>>> = {
  1: { MT: "cone", H1: "spread", D2: "cone", D4: "spread" },
  2: { MT: "share", H1: "spread", D2: "share", D4: "cone" },
  3: { MT: "cone", H1: "spread", D2: "cone", D4: "spread" },
  4: { ST: "share", H2: "spread", D1: "share", D3: "cone" },
  5: { ST: "cone", H2: "spread", D1: "cone", D3: "spread" },
  6: { ST: "share", H2: "spread", D1: "share", D3: "cone" }
};
const CLONE_BAIT_RADIUS = 2;
const KICK_RANGE = 8;
const KICK_ANGLE = Math.PI / 4;
const MOVE_SETTLE_MS = 2200;
const TOTAL_MS = MISSING_CAST_MS + (TOWER_ROUNDS - 1) * TOWER_INTERVAL_MS + TOWER_ACTIVATE_MS + 5000;
const INITIAL_POSITIONS: Record<PlayerRole, Vec2> = {
  MT: { x: -4.5, z: 12.5 },
  ST: { x: -1.5, z: 12.5 },
  D1: { x: 1.5, z: 12.5 },
  D2: { x: 4.5, z: 12.5 },
  H1: { x: -4.5, z: 15.5 },
  H2: { x: -1.5, z: 15.5 },
  D3: { x: 1.5, z: 15.5 },
  D4: { x: 4.5, z: 15.5 }
};

export function useScenarioPlayback(enabled: boolean, paused: boolean, controlledRole: PlayerRole | null = null) {
  const pausedRef = useRef(paused);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    resetNetcode();
    const store = useSimulatorStore.getState();
    const controlledPlayer = controlledRole ? PLAYERS.find((player) => player.role === controlledRole) : undefined;
    store.setSessionId(controlledPlayer?.id ?? null);
    store.setSelf(controlledRole ? `${controlledRole} 연습` : "공략보기", controlledRole);
    store.setConnectionStatus("connected");
    store.setErrorMessage(null);
    if (controlledPlayer) {
      const initial = INITIAL_POSITIONS[controlledRole as PlayerRole];
      setSelfId(controlledPlayer.id);
      ingestSnapshot(controlledPlayer.id, initial.x, initial.z, Math.PI, 0);
    }

    let frame = 0;
    let lastTime = performance.now();
    let elapsed = 0;
    const tick = (time: number) => {
      if (!pausedRef.current) {
        elapsed = (elapsed + Math.max(0, time - lastTime)) % TOTAL_MS;
      }
      lastTime = time;
      updateScenario(elapsed, controlledRole);
      frame = window.requestAnimationFrame(tick);
    };

    updateScenario(0, controlledRole);
    frame = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frame);
      resetNetcode();
      useSimulatorStore.getState().reset();
    };
  }, [enabled, controlledRole]);
}

function updateScenario(elapsed: number, controlledRole: PlayerRole | null) {
  const positions = samplePositions(elapsed);
  const markers = getMarkers(elapsed);
  const players: Record<string, PlayerSnapshot> = {};

  for (const player of PLAYERS) {
    const scriptedPosition = positions[player.role];
    const selfState = player.role === controlledRole ? getSelfState() : null;
    const position = selfState ? { x: selfState.x, z: selfState.z } : scriptedPosition;
    const nextPosition = samplePositions(Math.min(TOTAL_MS, elapsed + 80))[player.role];
    const rotation = selfState ? selfState.rotation : Math.atan2(nextPosition.x - position.x, nextPosition.z - position.z);
    const marker = markers[player.role] ?? "";
    const snapshot: PlayerSnapshot = {
      id: player.id,
      name: player.name,
      role: player.role,
      x: position.x,
      z: position.z,
      rotation,
      lastSeq: 0,
      marker,
      markerVisible: Boolean(marker)
    };
    players[player.id] = snapshot;
    if (player.role !== controlledRole) {
      ingestSnapshot(player.id, snapshot.x, snapshot.z, snapshot.rotation, 0);
    }
  }

  const round = getRound(elapsed);
  useSimulatorStore.getState().setPlayers(players);
  useSimulatorStore.getState().setGimmick({
    gimmick: "missing",
    phase: elapsed > TOTAL_MS - 3000 ? "success" : "running",
    round,
    elapsed,
    bossActive: true,
    bossCast: getBossCast(elapsed),
    towers: getTowers(elapsed),
    aoes: getAoes(elapsed, positions),
    logs: getLogs(elapsed)
  });
}

function samplePositions(elapsed: number): Record<PlayerRole, Vec2> {
  const frames = buildFrames();
  let previous = frames[0] as ScenarioFrame;
  let next = frames[frames.length - 1] as ScenarioFrame;

  for (let i = 1; i < frames.length; i++) {
    const frame = frames[i] as ScenarioFrame;
    if (frame.t >= elapsed) {
      next = frame;
      break;
    }
    previous = frame;
  }

  const span = Math.max(1, next.t - previous.t);
  const amount = smoothstep(Math.min(1, Math.max(0, (elapsed - previous.t) / span)));
  const positions = {} as Record<PlayerRole, Vec2>;
  for (const role of Object.keys(INITIAL_POSITIONS) as PlayerRole[]) {
    positions[role] = lerpVec(previous.positions[role], next.positions[role], amount);
  }
  return positions;
}

function buildFrames(): ScenarioFrame[] {
  const frames: ScenarioFrame[] = [{ t: 0, positions: INITIAL_POSITIONS, markers: {} }];
  let previous = INITIAL_POSITIONS;
  let previousWasKickBait = false;

  for (let round = 1; round <= TOWER_ROUNDS; round++) {
    const spawnAt = MISSING_CAST_MS + (round - 1) * TOWER_INTERVAL_MS;
    if (round === 1) {
      frames.push({ t: spawnAt, positions: INITIAL_POSITIONS, markers: INITIAL_MARKERS });
    }
    const positions = getRoundPositions(round);
    const settleAt = spawnAt + (previousWasKickBait ? MOVE_SETTLE_MS + 1400 : MOVE_SETTLE_MS);
    frames.push({ t: settleAt, positions, markers: getRoundMarkers(round) });
    frames.push({ t: spawnAt + TOWER_ACTIVATE_MS + AOE_SHOW_MS, positions, markers: getRoundMarkers(round) });
    previous = positions;
    previousWasKickBait = false;

    if (round % 2 === 0) {
      const baitArriveAt = spawnAt + TOWER_ACTIVATE_MS + AOE_SHOW_MS + MOVE_SETTLE_MS;
      const baitPositions = getKickBaitPositions(round, positions);
      frames.push({ t: baitArriveAt, positions: baitPositions, markers: getRoundMarkers(round) });
      frames.push({ t: baitArriveAt + 1200, positions: baitPositions, markers: getRoundMarkers(round) });
      previous = baitPositions;
      previousWasKickBait = true;
    }
  }

  frames.push({ t: TOTAL_MS, positions: previous, markers: {} });
  return frames.sort((a, b) => a.t - b.t);
}

function getRoundPositions(round: number): Record<PlayerRole, Vec2> {
  const towers = getTowerPair(round);
  const left = towers[0];
  const right = towers[1];
  const positions = { ...INITIAL_POSITIONS };
  const activeGroup = isGroupOneRound(round) ? 1 : 2;
  const activePlayers = PLAYERS.filter((player) => player.group === activeGroup);
  const inactivePlayers = PLAYERS.filter((player) => player.group !== activeGroup);

  if (round % 2 === 1) {
    const shares = activePlayers.filter((player) => getRoundMarkers(round)[player.role] === "share");
    const spread = activePlayers.find((player) => getRoundMarkers(round)[player.role] === "spread");
    const cone = activePlayers.find((player) => getRoundMarkers(round)[player.role] === "cone");
    if (shares[0]) positions[shares[0].role] = towerPoint(left, "center");
    if (shares[1]) positions[shares[1].role] = towerPoint(right, "inner");
    if (cone) positions[cone.role] = towerPoint(left, "outerEdge");
    if (spread) positions[spread.role] = towerPoint(right, "outer");
  } else {
    const cones = activePlayers.filter((player) => getRoundMarkers(round)[player.role] === "cone");
    const spreads = activePlayers.filter((player) => getRoundMarkers(round)[player.role] === "spread");
    const leftCone = bossTowerSideIntersection(left, "left");
    const rightCone = bossTowerSideIntersection(right, "right");
    if (cones[0]) positions[cones[0].role] = leftCone;
    if (spreads[0]) positions[spreads[0].role] = towerClockPoint(left, leftCone, 6, false);
    if (cones[1]) positions[cones[1].role] = rightCone;
    if (spreads[1]) positions[spreads[1].role] = towerClockPoint(right, rightCone, 6, false);
  }

  placeInactivePlayers(positions, inactivePlayers, left, right, round);
  return positions;
}

function placeInactivePlayers(
  positions: Record<PlayerRole, Vec2>,
  players: ScenarioPlayer[],
  left: Vec2,
  right: Vec2,
  round: number
) {
  const between = normalize({ x: (left.x + right.x) / 2, z: (left.z + right.z) / 2 });
  const tanks = players.filter((player) => player.role === "MT" || player.role === "ST");
  const healers = players.filter((player) => player.role === "H1" || player.role === "H2");
  const melees = players.filter((player) => player.role === "D1" || player.role === "D2");
  const rangeds = players.filter((player) => player.role === "D3" || player.role === "D4");
  const dealers = players.filter((player) => player.role.startsWith("D"));

  if (round % 2 === 1) {
    const tankSpot = betweenTowersAtCenterDistance(left, right, 5, 0.01);
    const dealerSpot = betweenTowersAtCenterDistance(right, left, 4);
    for (const dealer of dealers) {
      positions[dealer.role] = dealerSpot;
    }
    for (const tank of tanks) {
      positions[tank.role] = tankSpot;
    }
    for (const healer of healers) {
      positions[healer.role] = towerPoint(left, "healerOuterOutside");
    }
    return;
  }

  const tankSpot = bossClockPointFromSix(between, 11);
  const meleeSpot = bossClockPointFromSix(between, 1);
  for (const tank of tanks) {
    positions[tank.role] = tankSpot;
  }
  for (const melee of melees) {
    positions[melee.role] = meleeSpot;
  }
  const leftCone = bossTowerSideIntersection(left, "left");
  const rightCone = bossTowerSideIntersection(right, "right");
  for (const healer of healers) {
    positions[healer.role] = towerClockPoint(left, leftCone, 9, true, 0.75);
  }
  for (const ranged of rangeds) {
    positions[ranged.role] = towerClockPoint(right, rightCone, 3, true);
  }
}

function getKickBaitPositions(round: number, current: Record<PlayerRole, Vec2>): Record<PlayerRole, Vec2> {
  const positions = { ...current };
  const cast = getEvenRoundCast(round);
  const nextRound = Math.min(TOWER_ROUNDS, round + 1);
  const towerMid = scale(
    getTowerPair(nextRound).reduce((sum, tower) => add(sum, tower), { x: 0, z: 0 }),
    0.5
  );
  const baitDirection = cast === "past" ? normalize(towerMid) : scale(normalize(towerMid), -1);
  const bait = scale(baitDirection, 7);
  for (const player of PLAYERS) {
    positions[player.role] = add(bait, spreadOffset(player.role));
  }
  return positions;
}

function getMarkers(elapsed: number): Partial<Record<PlayerRole, MarkerType>> {
  if (elapsed < MISSING_CAST_MS) {
    return {};
  }
  if (elapsed < MISSING_CAST_MS + 5000) {
    return INITIAL_MARKERS;
  }

  for (let round = 1; round <= TOWER_ROUNDS; round++) {
    const activateAt = MISSING_CAST_MS + (round - 1) * TOWER_INTERVAL_MS + TOWER_ACTIVATE_MS;
    if (elapsed >= activateAt && elapsed < activateAt + 5000) {
      return POST_ROUND_MARKERS[round] ?? {};
    }
  }
  return {};
}

function getRoundMarkers(round: number): Partial<Record<PlayerRole, MarkerType>> {
  const groupOneOdd: Partial<Record<PlayerRole, MarkerType>> = { MT: "share", H1: "spread", D2: "share", D4: "cone" };
  const groupOneEven: Partial<Record<PlayerRole, MarkerType>> = { MT: "cone", H1: "spread", D2: "cone", D4: "spread" };
  const groupTwoInitial: Partial<Record<PlayerRole, MarkerType>> = { ST: "spread", H2: "spread", D1: "cone", D3: "cone" };
  const groupTwoOdd: Partial<Record<PlayerRole, MarkerType>> = { ST: "share", H2: "spread", D1: "share", D3: "cone" };
  const groupTwoEven: Partial<Record<PlayerRole, MarkerType>> = { ST: "cone", H2: "spread", D1: "cone", D3: "spread" };

  if (isGroupOneRound(round)) {
    return round % 2 === 1 ? groupOneOdd : groupOneEven;
  }
  if (round === 4) {
    return groupTwoInitial;
  }
  return round % 2 === 1 ? groupTwoOdd : groupTwoEven;
}

function getAoes(elapsed: number, positions: Record<PlayerRole, Vec2>): AoeView[] {
  if (elapsed >= MISSING_CAST_MS && elapsed <= MISSING_CAST_MS + AOE_SHOW_MS) {
    return [
      {
        id: "guide-aoe-raidwide",
        kind: "raidwide",
        x: 0,
        z: 0,
        radius: ARENA_RADIUS,
        dir: 0,
        angle: 0,
        range: 0
      }
    ];
  }

  const round = getRound(elapsed);
  if (round === 0) {
    return [];
  }
  const activateAt = MISSING_CAST_MS + (round - 1) * TOWER_INTERVAL_MS + TOWER_ACTIVATE_MS;
  const aoes: AoeView[] = [];

  if (round % 2 === 0) {
    const kickAt = activateAt + AOE_SHOW_MS + MOVE_SETTLE_MS;
    if (elapsed >= kickAt && elapsed <= kickAt + AOE_SHOW_MS) {
      for (const role of nearestRolesToBoss(positions, 4)) {
        const position = positions[role];
        aoes.push({
          id: `guide-clone-spot-${round}-${role}`,
          kind: "cloneSpot",
          x: position.x,
          z: position.z,
          radius: 0.42,
          dir: 0,
          angle: 0,
          range: 0
        });
        aoes.push({
          id: `guide-kick-${round}-${role}`,
          kind: "kick",
          x: position.x,
          z: position.z,
          radius: 0,
          dir: Math.atan2(-position.x, -position.z),
          angle: KICK_ANGLE,
          range: KICK_RANGE
        });
      }
      return aoes;
    }
  }

  if (elapsed < activateAt || elapsed > activateAt + AOE_SHOW_MS) {
    return [];
  }

  const markers = getRoundMarkers(round);

  if (round % 2 === 0) {
    for (const role of nearestRolesToBoss(positions, 4)) {
      const position = positions[role];
      aoes.push({
        id: `guide-clone-${round}-${role}`,
        kind: "clone",
        x: position.x,
        z: position.z,
        radius: CLONE_BAIT_RADIUS,
        dir: 0,
        angle: 0,
        range: 0
      });
    }
  }
  for (const role of Object.keys(markers) as PlayerRole[]) {
    const marker = markers[role];
    const position = positions[role];
    if (!marker || !position) {
      continue;
    }
    if (marker === "share" || marker === "spread") {
      aoes.push({
        id: `guide-aoe-${round}-${role}`,
        kind: marker,
        x: position.x,
        z: position.z,
        radius: marker === "share" ? SHARE_RADIUS : SPREAD_RADIUS,
        dir: 0,
        angle: 0,
        range: 0
      });
      continue;
    }

    const target = nearestPosition(role, positions);
    aoes.push({
      id: `guide-aoe-${round}-${role}`,
      kind: "cone",
      x: position.x,
      z: position.z,
      radius: 0,
      dir: target ? Math.atan2(target.x - position.x, target.z - position.z) : 0,
      angle: CONE_ANGLE,
      range: CONE_RANGE
    });
  }
  return aoes;
}

function getTowers(elapsed: number): TowerView[] {
  const round = getRound(elapsed);
  if (round === 0) {
    return [];
  }
  const spawnAt = MISSING_CAST_MS + (round - 1) * TOWER_INTERVAL_MS;
  if (elapsed < spawnAt || elapsed > spawnAt + TOWER_ACTIVATE_MS + 900) {
    return [];
  }
  return getTowerPair(round).map((tower, index) => ({
    id: `guide-tower-${round}-${index}`,
    x: tower.x,
    z: tower.z,
    round
  }));
}

function getTowerPair(round: number): [Vec2, Vec2] {
  const base = 3;
  const shift = round - 1;
  const first = directionToPosition(base + shift, TOWER_DISTANCE);
  const second = directionToPosition(base + 2 + shift, TOWER_DISTANCE);
  return sortTowersByBossFacingLeftRight(first, second);
}

function sortTowersByBossFacingLeftRight(a: Vec2, b: Vec2): [Vec2, Vec2] {
  const midpoint = scale(add(a, b), 0.5);
  const forwardToBoss = normalize(scale(midpoint, -1));
  const leftSide = { x: -forwardToBoss.z, z: forwardToBoss.x };
  return dot(a, leftSide) < dot(b, leftSide) ? [a, b] : [b, a];
}

function getRound(elapsed: number): number {
  if (elapsed < MISSING_CAST_MS) {
    return 0;
  }
  return Math.min(TOWER_ROUNDS, Math.max(1, Math.floor((elapsed - MISSING_CAST_MS) / TOWER_INTERVAL_MS) + 1));
}

function getBossCast(elapsed: number): "" | "missing" | "future" | "past" {
  if (elapsed < MISSING_CAST_MS) {
    return "missing";
  }
  const round = getRound(elapsed);
  const spawnAt = MISSING_CAST_MS + (round - 1) * TOWER_INTERVAL_MS;
  if (round % 2 !== 0 || elapsed < spawnAt || elapsed > spawnAt + BOSS_CAST_MS) {
    return "";
  }
  return getEvenRoundCast(round);
}

function getEvenRoundCast(round: number): "future" | "past" {
  return round % 4 === 0 ? "future" : "past";
}

function getLogs(elapsed: number): string[] {
  const round = getRound(elapsed);
  const cast = getBossCast(elapsed);
  if (cast === "missing") {
    return ["[자동 공략] 보스 캐스팅: 행방불명", "[자동 공략] 광역 후 초기 머리징을 확인합니다."];
  }
  return [
    "[자동 공략] 고정 패턴: MT/H1/D2/D4 = 1조, ST/H2/D1/D3 = 2조",
    `[자동 공략] ${round}번 탑 처리 중 (${isGroupOneRound(round) ? "1조" : "2조"})`,
    cast ? `[자동 공략] 보스 캐스팅: ${cast === "future" ? "미래의 종언" : "과거의 종언"}` : "[자동 공략] 탑 처리 위치 확인"
  ];
}

function isGroupOneRound(round: number): boolean {
  return round === 1 || round === 2 || round === 3 || round === 8;
}

function towerPoint(
  tower: Vec2,
  point:
    | "center"
    | "inner"
    | "outer"
    | "outerEdge"
    | "outerInner"
    | "oppositeOuter"
    | "outerOutside"
    | "healerOuterOutside"
    | "innerOutside"
): Vec2 {
  const inward = normalize({ x: -tower.x, z: -tower.z });
  const outward = scale(inward, -1);
  switch (point) {
    case "center":
      return tower;
    case "inner":
      return add(tower, scale(inward, 1.6));
    case "outer":
      return add(tower, scale(outward, 2.2));
    case "outerEdge":
      return add(tower, scale(outward, TOWER_RADIUS - 0.05));
    case "outerInner":
      return add(tower, scale(outward, 1.15));
    case "oppositeOuter":
      return add(tower, scale(inward, 2.2));
    case "outerOutside":
      return add(tower, scale(outward, 3.45));
    case "healerOuterOutside":
      return add(tower, scale(outward, TOWER_RADIUS + 0.7));
    case "innerOutside":
      return add(tower, scale(inward, 3.45));
  }
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
  const a = add(scale(fromBoss, along), scale(side, height));
  const b = add(scale(fromBoss, along), scale(side, -height));
  return [a, b];
}

function towerClockPoint(tower: Vec2, twelvePoint: Vec2, hour: 3 | 6 | 9, outside: boolean, outsideGap = 0.45): Vec2 {
  const twelve = normalize({ x: twelvePoint.x - tower.x, z: twelvePoint.z - tower.z });
  const right = { x: -twelve.z, z: twelve.x };
  const radius = outside ? TOWER_RADIUS + outsideGap : TOWER_RADIUS - 0.35;

  if (hour === 3) {
    return add(tower, scale(right, radius));
  }
  if (hour === 9) {
    return add(tower, scale(right, -radius));
  }
  return add(tower, scale(twelve, -radius));
}

function betweenTowersAtCenterDistance(anchorTower: Vec2, otherTower: Vec2, centerDistance: number, towerGap = 0.45): Vec2 {
  const radius = TOWER_RADIUS + towerGap;
  const intersections = circleIntersections({ x: 0, z: 0 }, centerDistance, anchorTower, radius);
  if (intersections.length === 0) {
    return scale(normalize(add(anchorTower, otherTower)), centerDistance);
  }
  return intersections.reduce((best, point) => (distance2D(point, otherTower) < distance2D(best, otherTower) ? point : best));
}

function circleIntersections(a: Vec2, radiusA: number, b: Vec2, radiusB: number): Vec2[] {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const distance = Math.hypot(dx, dz);
  if (distance === 0 || distance > radiusA + radiusB || distance < Math.abs(radiusA - radiusB)) {
    return [];
  }

  const along = (radiusA * radiusA - radiusB * radiusB + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, radiusA * radiusA - along * along));
  const ux = dx / distance;
  const uz = dz / distance;
  const base = { x: a.x + along * ux, z: a.z + along * uz };
  const offset = { x: -uz * height, z: ux * height };
  return [add(base, offset), add(base, scale(offset, -1))];
}

function nearestRolesToBoss(positions: Record<PlayerRole, Vec2>, count: number): PlayerRole[] {
  return (Object.entries(positions) as [PlayerRole, Vec2][])
    .sort((a, b) => Math.hypot(a[1].x, a[1].z) - Math.hypot(b[1].x, b[1].z))
    .slice(0, count)
    .map(([role]) => role);
}

function nearestPosition(role: PlayerRole, positions: Record<PlayerRole, Vec2>): Vec2 | null {
  const source = positions[role];
  let nearest: Vec2 | null = null;
  let nearestDistance = Infinity;
  for (const [otherRole, position] of Object.entries(positions) as [PlayerRole, Vec2][]) {
    if (otherRole === role) {
      continue;
    }
    const distance = distance2D(source, position);
    if (distance < nearestDistance) {
      nearest = position;
      nearestDistance = distance;
    }
  }
  return nearest;
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

function lerpVec(a: Vec2, b: Vec2, amount: number): Vec2 {
  return { x: a.x + (b.x - a.x) * amount, z: a.z + (b.z - a.z) * amount };
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}
