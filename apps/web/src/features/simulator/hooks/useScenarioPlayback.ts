import { useEffect, useRef } from "react";
import {
  AOE_SHOW_MS,
  ARENA_RADIUS,
  BOSS_RADIUS,
  BOSS_CAST_MS,
  CONE_ANGLE,
  CONE_RANGE,
  DEALER_ROLES,
  directionToPosition,
  DIRECTION_COUNT,
  getMissingActiveRolesForRound,
  getMissingGroupOneRoles,
  getMissingStrategyPositions,
  isInCircle,
  isInCone,
  MARKER_CAP,
  MISSING_CAST_MS,
  SHARE_REQUIRED,
  SHARE_RADIUS,
  SPREAD_RADIUS,
  TANK_HEALER_ROLES,
  TOWER_ACTIVATE_MS,
  TOWER_DISTANCE,
  TOWER_INTERVAL_MS,
  TOWER_RADIUS,
  TOWER_REQUIRED_OCCUPANTS,
  TOWER_ROUNDS,
  type MarkerType,
  type PlayerRole,
  type PlayerSnapshot,
  sortMissingTowersByBossFacingLeftRight
} from "@raid-simulator/shared";
import type { PriorityMarkerType } from "@raid-simulator/shared";
import { ingestSnapshot, resetNetcode, setSelfId } from "../netcode";
import { useSimulatorStore, type AoeView, type TowerView } from "../stores/simulatorStore";

type Vec2 = { x: number; z: number };
type ScenarioPlayer = { id: string; name: string; role: PlayerRole; marker: MarkerType };
type ScenarioConfig = {
  initialMarkers: Record<PlayerRole, MarkerType>;
  groupOneRoles: PlayerRole[];
  roundMarkers: Record<number, Partial<Record<PlayerRole, MarkerType>>>;
  postRoundMarkers: Record<number, Partial<Record<PlayerRole, MarkerType>>>;
  markerCountsByRound: Record<number, Record<PlayerRole, number>>;
  priorityMarkers: Partial<Record<PlayerRole, PriorityMarkerType>>;
  baseIndex: number;
  rotationDirection: 1 | -1;
  evenCasts: Record<number, "future" | "past">;
};
type ScenarioFrame = {
  t: number;
  positions: Record<PlayerRole, Vec2>;
  markers: Partial<Record<PlayerRole, MarkerType>>;
};
type TowerSide = "왼쪽탑" | "오른쪽탑";
type ScenarioValidation = {
  failed: boolean;
  completedRounds: number;
  results: RoundValidation[];
};
type RoundValidation = {
  round: number;
  ok: boolean;
  messages: string[];
};

const PLAYERS: ScenarioPlayer[] = [
  { id: "guide-mt", name: "MT", role: "MT", marker: "share" },
  { id: "guide-st", name: "ST", role: "ST", marker: "spread" },
  { id: "guide-h1", name: "H1", role: "H1", marker: "spread" },
  { id: "guide-h2", name: "H2", role: "H2", marker: "spread" },
  { id: "guide-d1", name: "D1", role: "D1", marker: "cone" },
  { id: "guide-d2", name: "D2", role: "D2", marker: "share" },
  { id: "guide-d3", name: "D3", role: "D3", marker: "cone" },
  { id: "guide-d4", name: "D4", role: "D4", marker: "cone" }
];

const CLONE_BAIT_RADIUS = 4.5;
const INITIAL_MOVE_DELAY_MS = 1000;
const MOVE_SETTLE_MS = 2200;
const WAYMARK_INNER_DISTANCE = 11.65;
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
const INITIAL_LEFT_PRIORITY: PlayerRole[] = ["H1", "H2", "MT", "ST", "D1", "D2", "D3", "D4"];
const MARKER_ORDER: MarkerType[] = ["share", "cone", "spread"];
const MARKER_DEFAULT_SIDE: Record<MarkerType, "left" | "right"> = {
  share: "left",
  cone: "left",
  spread: "right"
};

export function useScenarioPlayback(enabled: boolean, paused: boolean, focusRole: PlayerRole | null = null) {
  const pausedRef = useRef(paused);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const scenario = createScenarioConfig();
    resetNetcode();
    const store = useSimulatorStore.getState();
    const focusedPlayer = focusRole ? PLAYERS.find((player) => player.role === focusRole) : undefined;
    store.setSessionId(focusedPlayer?.id ?? null);
    store.setSelf(focusRole ? `${focusRole} 공략보기` : "공략보기", focusRole);
    store.setConnectionStatus("connected");
    store.setErrorMessage(null);
    if (focusedPlayer) {
      const initial = INITIAL_POSITIONS[focusRole as PlayerRole];
      setSelfId(focusedPlayer.id);
      ingestSnapshot(focusedPlayer.id, initial.x, initial.z, Math.PI, 0);
    }

    let frame = 0;
    let lastTime = performance.now();
    let elapsed = 0;
    const tick = (time: number) => {
      if (!pausedRef.current) {
        elapsed = Math.min(TOTAL_MS, elapsed + Math.max(0, time - lastTime));
      }
      lastTime = time;
      updateScenario(elapsed, focusRole, pausedRef.current, scenario);
      if (pausedRef.current || elapsed < TOTAL_MS) {
        frame = window.requestAnimationFrame(tick);
      }
    };

    updateScenario(0, focusRole, pausedRef.current, scenario);
    frame = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frame);
      resetNetcode();
      useSimulatorStore.getState().reset();
    };
  }, [enabled, focusRole]);
}

function createScenarioConfig(): ScenarioConfig {
  const initialMarkers = createInitialMarkers();
  const groupOneRoles = getMissingGroupOneRoles(initialMarkers);
  const markerCounts = Object.fromEntries(PLAYERS.map((player) => [player.role, 1])) as Record<PlayerRole, number>;
  const currentMarkers = { ...initialMarkers };
  const roundMarkers: Record<number, Partial<Record<PlayerRole, MarkerType>>> = {};
  const postRoundMarkers: Record<number, Partial<Record<PlayerRole, MarkerType>>> = {};
  const markerCountsByRound: Record<number, Record<PlayerRole, number>> = {};
  let priorityMarkers: Partial<Record<PlayerRole, PriorityMarkerType>> = {};

  for (let round = 1; round <= TOWER_ROUNDS; round++) {
    const activeRoles = getMissingActiveRolesForRound(round, groupOneRoles);
    markerCountsByRound[round] = { ...markerCounts };
    const currentRoundMarkers = pickMarkers(currentMarkers, activeRoles);
    roundMarkers[round] = currentRoundMarkers;
    const nextMarkers = createNextMarkers(currentRoundMarkers, activeRoles, markerCounts);
    postRoundMarkers[round] = nextMarkers;
    if (round === 3) {
      priorityMarkers = createFinalPriorityMarkers(nextMarkers, activeRoles);
    }
    for (const role of activeRoles) {
      const marker = nextMarkers[role];
      if (marker) {
        currentMarkers[role] = marker;
      }
    }
  }

  const evenCasts: Record<number, "future" | "past"> = {};
  for (let round = 2; round <= TOWER_ROUNDS; round += 2) {
    evenCasts[round] = Math.random() < 0.5 ? "future" : "past";
  }

  return {
    initialMarkers,
    groupOneRoles,
    roundMarkers,
    postRoundMarkers,
    markerCountsByRound,
    priorityMarkers,
    baseIndex: Math.floor(Math.random() * DIRECTION_COUNT),
    rotationDirection: Math.random() < 0.5 ? 1 : -1,
    evenCasts
  };
}

function createFinalPriorityMarkers(
  markers: Partial<Record<PlayerRole, MarkerType>>,
  roles: PlayerRole[]
): Partial<Record<PlayerRole, PriorityMarkerType>> {
  const priorityMarkers: Partial<Record<PlayerRole, PriorityMarkerType>> = {};
  const cones = shuffle(roles.filter((role) => markers[role] === "cone"));
  const spreads = shuffle(roles.filter((role) => markers[role] === "spread"));
  const numberMarkers = ["number1", "number2"] as const;
  const forbidMarkers = ["forbid1", "forbid2"] as const;

  cones.forEach((role, index) => {
    const marker = numberMarkers[index];
    if (marker) priorityMarkers[role] = marker;
  });
  spreads.forEach((role, index) => {
    const marker = forbidMarkers[index];
    if (marker) priorityMarkers[role] = marker;
  });
  return priorityMarkers;
}

function createInitialMarkers(): Record<PlayerRole, MarkerType> {
  const markers = {} as Record<PlayerRole, MarkerType>;
  const tankHealer = shuffle([...TANK_HEALER_ROLES]);
  const dealers = shuffle([...DEALER_ROLES]);
  const shareTankHealer = tankHealer[0];
  const shareDealer = dealers[0];
  if (shareTankHealer) markers[shareTankHealer] = "share";
  if (shareDealer) markers[shareDealer] = "share";

  const patternA = Math.random() < 0.5;
  const tankHealerMarker: MarkerType = patternA ? "cone" : "spread";
  const dealerMarker: MarkerType = patternA ? "spread" : "cone";
  for (const role of tankHealer.slice(1)) {
    markers[role] = tankHealerMarker;
  }
  for (const role of dealers.slice(1)) {
    markers[role] = dealerMarker;
  }
  return markers;
}

function createNextMarkers(
  previousMarkers: Partial<Record<PlayerRole, MarkerType>>,
  roles: PlayerRole[],
  markerCounts: Record<PlayerRole, number>
): Partial<Record<PlayerRole, MarkerType>> {
  const eligibleRoles = roles.filter((role) => markerCounts[role] < MARKER_CAP);
  if (eligibleRoles.length === 0) {
    return {};
  }
  const shareCount = roles.filter((role) => previousMarkers[role] === "share").length;
  const pool: MarkerType[] = shareCount === 2 ? ["cone", "cone", "spread", "spread"] : ["cone", "spread", "share", "share"];
  const shuffledRoles = shuffle(eligibleRoles);
  const shuffledPool = shuffle(pool);
  const nextMarkers: Partial<Record<PlayerRole, MarkerType>> = {};
  shuffledRoles.forEach((role, index) => {
    const marker = shuffledPool[index];
    if (marker) {
      nextMarkers[role] = marker;
      markerCounts[role] += 1;
    }
  });
  return nextMarkers;
}

function pickMarkers(
  markers: Record<PlayerRole, MarkerType>,
  roles: PlayerRole[]
): Partial<Record<PlayerRole, MarkerType>> {
  const picked: Partial<Record<PlayerRole, MarkerType>> = {};
  for (const role of roles) {
    picked[role] = markers[role];
  }
  return picked;
}

function updateScenario(elapsed: number, focusRole: PlayerRole | null, paused: boolean, scenario: ScenarioConfig) {
  const positions = samplePositions(elapsed, scenario);
  const markers = getMarkers(elapsed, scenario);
  const priorityMarkers = getPriorityMarkers(elapsed, scenario);
  const validation = getScenarioValidation(elapsed, scenario);
  const players: Record<string, PlayerSnapshot> = {};
  const actualPositions = {} as Record<PlayerRole, Vec2>;

  for (const player of PLAYERS) {
    const scriptedPosition = positions[player.role];
    const position = scriptedPosition;
    actualPositions[player.role] = position;
    const nextPosition = samplePositions(Math.min(TOTAL_MS, elapsed + 80), scenario)[player.role];
    const rotation = Math.atan2(nextPosition.x - position.x, nextPosition.z - position.z);
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
      markerVisible: Boolean(marker),
      priorityMarker: priorityMarkers[player.role] ?? ""
    };
    players[player.id] = snapshot;
    ingestSnapshot(player.id, snapshot.x, snapshot.z, snapshot.rotation, 0);
  }

  const round = getRound(elapsed);
  useSimulatorStore.getState().setPlayers(players);
  useSimulatorStore.getState().setGimmick({
    gimmick: "missing",
    phase: validation.failed ? "failed" : elapsed > TOTAL_MS - 3000 ? "success" : "running",
    round,
    elapsed,
    paused,
    controlsLocked: false,
    bossActive: true,
    bossCast: getBossCast(elapsed, scenario),
    towers: getTowers(elapsed, scenario),
    aoes: getAoes(elapsed, actualPositions, scenario),
    logs: getLogs(elapsed, scenario, validation)
  });
}

function samplePositions(elapsed: number, scenario: ScenarioConfig): Record<PlayerRole, Vec2> {
  const frames = buildFrames(scenario);
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
  const amount = Math.min(1, Math.max(0, (elapsed - previous.t) / span));
  const positions = {} as Record<PlayerRole, Vec2>;
  for (const role of Object.keys(INITIAL_POSITIONS) as PlayerRole[]) {
    positions[role] = lerpVec(previous.positions[role], next.positions[role], amount);
  }
  return positions;
}

function buildFrames(scenario: ScenarioConfig): ScenarioFrame[] {
  const frames: ScenarioFrame[] = [{ t: 0, positions: INITIAL_POSITIONS, markers: {} }];
  let previous = INITIAL_POSITIONS;
  let previousWasKickBait = false;

  for (let round = 1; round <= TOWER_ROUNDS; round++) {
    const spawnAt = MISSING_CAST_MS + (round - 1) * TOWER_INTERVAL_MS;
    const moveStartAt = spawnAt + (round === 1 ? INITIAL_MOVE_DELAY_MS : 0);
    if (round === 1) {
      frames.push({ t: spawnAt, positions: INITIAL_POSITIONS, markers: scenario.initialMarkers });
      frames.push({ t: moveStartAt, positions: INITIAL_POSITIONS, markers: scenario.initialMarkers });
    }
    const positions = getRoundPositions(round, scenario, previous);
    const settleAt = moveStartAt + (previousWasKickBait ? MOVE_SETTLE_MS + 1400 : MOVE_SETTLE_MS);
    frames.push({ t: settleAt, positions, markers: getRoundMarkers(round, scenario) });
    frames.push({ t: spawnAt + TOWER_ACTIVATE_MS + AOE_SHOW_MS, positions, markers: getRoundMarkers(round, scenario) });
    previous = positions;
    previousWasKickBait = false;

    if (round % 2 === 0) {
      const baitArriveAt = spawnAt + TOWER_ACTIVATE_MS + AOE_SHOW_MS + MOVE_SETTLE_MS;
      const baitPositions = getKickBaitPositions(round, positions, scenario);
      frames.push({ t: baitArriveAt, positions: baitPositions, markers: getRoundMarkers(round, scenario) });
      frames.push({ t: baitArriveAt + 1200, positions: baitPositions, markers: getRoundMarkers(round, scenario) });
      previous = baitPositions;
      previousWasKickBait = true;
    }
  }

  frames.push({ t: TOTAL_MS, positions: previous, markers: {} });
  return frames.sort((a, b) => a.t - b.t);
}

function getRoundPositions(round: number, scenario: ScenarioConfig, currentPositions: Record<PlayerRole, Vec2>): Record<PlayerRole, Vec2> {
  const towers = getTowerPair(round, scenario);
  const left = towers[0];
  const right = towers[1];
  const markers = getRoundMarkers(round, scenario);
  const input = {
    round,
    leftTower: left,
    rightTower: right,
    markers,
    currentPositions,
    groupOneRoles: scenario.groupOneRoles,
    priorityMarkers: scenario.priorityMarkers
  };
  const markerCounts = scenario.markerCountsByRound[round];
  return getMissingStrategyPositions(markerCounts ? { ...input, markerCounts } : input) as Record<PlayerRole, Vec2>;
}

function placeActiveTowerPlayers(
  positions: Record<PlayerRole, Vec2>,
  activePlayers: ScenarioPlayer[],
  markers: Partial<Record<PlayerRole, MarkerType>>,
  sideAssignments: Partial<Record<PlayerRole, "left" | "right">>,
  left: Vec2,
  right: Vec2
) {
  for (const side of ["left", "right"] as const) {
    const tower = side === "left" ? left : right;
    const players = activePlayers
      .filter((player) => sideAssignments[player.role] === side)
      .sort((a, b) => MARKER_ORDER.indexOf(markers[a.role] ?? "spread") - MARKER_ORDER.indexOf(markers[b.role] ?? "spread"));
    players.forEach((player, index) => {
      positions[player.role] = towerOwnerPoint(tower, index);
    });
  }
}

function placeSupportPlayers(
  positions: Record<PlayerRole, Vec2>,
  activePlayers: ScenarioPlayer[],
  inactivePlayers: ScenarioPlayer[],
  markers: Partial<Record<PlayerRole, MarkerType>>,
  sideAssignments: Partial<Record<PlayerRole, "left" | "right">>,
  left: Vec2,
  right: Vec2
) {
  const freeRoles = inactivePlayers.map((player) => player.role);
  const takeFreeRole = () => freeRoles.shift();

  for (const side of ["left", "right"] as const) {
    const tower = side === "left" ? left : right;
    const towerPlayers = activePlayers
      .filter((player) => sideAssignments[player.role] === side)
      .sort((a, b) => MARKER_ORDER.indexOf(markers[a.role] ?? "spread") - MARKER_ORDER.indexOf(markers[b.role] ?? "spread"));

    towerPlayers.forEach((player, index) => {
      const marker = markers[player.role];
      if (marker !== "share") {
        return;
      }
      const helpersNeeded = 2;
      for (let helperIndex = 0; helperIndex < helpersNeeded; helperIndex++) {
        const role = takeFreeRole();
        if (!role) {
          return;
        }
        positions[role] = towerSupportPoint(tower, index, helperIndex);
      }
    });
  }

  for (const side of ["left", "right"] as const) {
    const tower = side === "left" ? left : right;
    const towerPlayers = activePlayers
      .filter((player) => sideAssignments[player.role] === side)
      .sort((a, b) => MARKER_ORDER.indexOf(markers[a.role] ?? "spread") - MARKER_ORDER.indexOf(markers[b.role] ?? "spread"));

    towerPlayers.forEach((player, index) => {
      const marker = markers[player.role];
      if (marker !== "cone") {
        return;
      }
      const role = takeFreeRole();
      if (!role) {
        return;
      }
      positions[role] = towerConeBaitPoint(tower, index);
    });
  }

  for (const role of freeRoles) {
    positions[role] = safeIdlePoint(role);
  }
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
    const tankSpot = betweenTowersAtCenterDistance(left, right, 8, 0.3);
    const dealerSpot = betweenTowersAtCenterDistance(right, left, 6, 0.3);
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
  for (const healer of healers) {
    positions[healer.role] = bossClockPointFromSix(between, 9, WAYMARK_INNER_DISTANCE);
  }
  for (const ranged of rangeds) {
    positions[ranged.role] = bossClockPointFromSix(between, 3, WAYMARK_INNER_DISTANCE);
  }
}

function buildScenarioSideAssignments(
  roles: PlayerRole[],
  markers: Partial<Record<PlayerRole, MarkerType>>,
  scenario: ScenarioConfig,
  round: number,
  currentPositions: Record<PlayerRole, Vec2>,
  left: Vec2,
  right: Vec2
): Partial<Record<PlayerRole, "left" | "right">> {
  const assignments: Partial<Record<PlayerRole, "left" | "right">> = {};
  const counts: Record<"left" | "right", number> = { left: 0, right: 0 };
  const markerCounts: Partial<Record<PlayerRole, number>> = scenario.markerCountsByRound[round] ?? {};
  const entries = roles
    .map((role) => ({ role, marker: markers[role], position: currentPositions[role], markerCount: markerCounts[role] ?? 1 }))
    .filter((entry): entry is { role: PlayerRole; marker: MarkerType; position: Vec2; markerCount: number } => Boolean(entry.marker && entry.position));

  const assign = (role: PlayerRole, preferred: "left" | "right") => {
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

    const sideGroups = new Map<"left" | "right", typeof sameMarker>();
    for (const entry of sameMarker) {
      const side = currentTowerSide(entry.position, left, right);
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
      const sortedByDistance = [...groupEntries].sort((a, b) => distance2D(a.position, { x: 0, z: 0 }) - distance2D(b.position, { x: 0, z: 0 }));
      const opposite = side === "left" ? "right" : "left";
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

function currentTowerSide(position: Vec2, left: Vec2, right: Vec2): "left" | "right" {
  const midpoint = scale(add(left, right), 0.5);
  const forwardToBoss = normalize(scale(midpoint, -1));
  const leftAxis = { x: -forwardToBoss.z, z: forwardToBoss.x };
  return dot(position, leftAxis) < 0 ? "left" : "right";
}

function sideWithRoom(counts: Record<"left" | "right", number>): "left" | "right" {
  return counts.left <= counts.right ? "left" : "right";
}

function towerOwnerPoint(tower: Vec2, slotIndex: number): Vec2 {
  const radial = towerRadial(tower, slotIndex);
  return add(tower, scale(radial, TOWER_RADIUS - 0.55));
}

function towerSupportPoint(tower: Vec2, slotIndex: number, helperIndex: number): Vec2 {
  const radial = towerRadial(tower, slotIndex);
  const tangent = { x: -radial.z, z: radial.x };
  const side = helperIndex === 0 ? -1 : 1;
  return add(tower, add(scale(radial, TOWER_RADIUS + 0.45), scale(tangent, side * 0.65)));
}

function towerConeBaitPoint(tower: Vec2, slotIndex: number): Vec2 {
  const radial = towerRadial(tower, slotIndex);
  return add(tower, scale(radial, TOWER_RADIUS + 0.8));
}

function safeIdlePoint(role: PlayerRole): Vec2 {
  const offsets: Record<PlayerRole, Vec2> = {
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

function towerRadial(tower: Vec2, slotIndex: number): Vec2 {
  const outward = normalize(tower);
  return slotIndex % 2 === 0 ? outward : scale(outward, -1);
}

function getKickBaitPositions(round: number, current: Record<PlayerRole, Vec2>, scenario: ScenarioConfig): Record<PlayerRole, Vec2> {
  const positions = { ...current };
  const cast = getEvenRoundCast(round, scenario);
  const nextRound = Math.min(TOWER_ROUNDS, round + 1);
  const towerMid = scale(
    getTowerPair(nextRound, scenario).reduce((sum, tower) => add(sum, tower), { x: 0, z: 0 }),
    0.5
  );
  const baitDirection = cast === "past" ? normalize(towerMid) : scale(normalize(towerMid), -1);
  const bait = scale(baitDirection, 7);
  for (const player of PLAYERS) {
    positions[player.role] = add(bait, spreadOffset(player.role));
  }
  return positions;
}

function getMarkers(elapsed: number, scenario: ScenarioConfig): Partial<Record<PlayerRole, MarkerType>> {
  if (elapsed < MISSING_CAST_MS) {
    return {};
  }
  if (elapsed < MISSING_CAST_MS + 5000) {
    return scenario.initialMarkers;
  }

  for (let round = 1; round <= TOWER_ROUNDS; round++) {
    const activateAt = MISSING_CAST_MS + (round - 1) * TOWER_INTERVAL_MS + TOWER_ACTIVATE_MS;
    if (elapsed >= activateAt && elapsed < activateAt + 5000) {
      return scenario.postRoundMarkers[round] ?? {};
    }
  }
  return {};
}

function getPriorityMarkers(elapsed: number, scenario: ScenarioConfig): Partial<Record<PlayerRole, PriorityMarkerType>> {
  const roundThreeActivateAt = MISSING_CAST_MS + 2 * TOWER_INTERVAL_MS + TOWER_ACTIVATE_MS;
  const roundEightActivateAt = MISSING_CAST_MS + 7 * TOWER_INTERVAL_MS + TOWER_ACTIVATE_MS;
  if (elapsed < roundThreeActivateAt + 5000 || elapsed > roundEightActivateAt + AOE_SHOW_MS) {
    return {};
  }
  return scenario.priorityMarkers;
}

function getRoundMarkers(round: number, scenario: ScenarioConfig): Partial<Record<PlayerRole, MarkerType>> {
  return scenario.roundMarkers[round] ?? {};
}

function getAoes(elapsed: number, positions: Record<PlayerRole, Vec2>, scenario: ScenarioConfig): AoeView[] {
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
    const cloneSpotAt = activateAt + AOE_SHOW_MS + MOVE_SETTLE_MS;
    if (elapsed >= cloneSpotAt && elapsed <= cloneSpotAt + AOE_SHOW_MS) {
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
      }
      return aoes;
    }
  }

  if (elapsed < activateAt || elapsed > activateAt + AOE_SHOW_MS) {
    return [];
  }

  const markers = getRoundMarkers(round, scenario);

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

function getTowers(elapsed: number, scenario: ScenarioConfig): TowerView[] {
  const round = getRound(elapsed);
  if (round === 0) {
    return [];
  }
  const spawnAt = MISSING_CAST_MS + (round - 1) * TOWER_INTERVAL_MS;
  if (elapsed < spawnAt || elapsed > spawnAt + TOWER_ACTIVATE_MS + 900) {
    return [];
  }
  return getTowerPair(round, scenario).map((tower, index) => ({
    id: `guide-tower-${round}-${index}`,
    x: tower.x,
    z: tower.z,
    round
  }));
}

function getTowerPair(round: number, scenario: ScenarioConfig): [Vec2, Vec2] {
  const shift = (round - 1) * scenario.rotationDirection;
  const first = directionToPosition(scenario.baseIndex + shift, TOWER_DISTANCE);
  const second = directionToPosition(scenario.baseIndex + 2 + shift, TOWER_DISTANCE);
  return sortTowersByBossFacingLeftRight(first, second);
}

function sortTowersByBossFacingLeftRight(a: Vec2, b: Vec2): [Vec2, Vec2] {
  return sortMissingTowersByBossFacingLeftRight(a, b);
}

function getRound(elapsed: number): number {
  if (elapsed < MISSING_CAST_MS) {
    return 0;
  }
  return Math.min(TOWER_ROUNDS, Math.max(1, Math.floor((elapsed - MISSING_CAST_MS) / TOWER_INTERVAL_MS) + 1));
}

function getBossCast(elapsed: number, scenario: ScenarioConfig): "" | "missing" | "future" | "past" {
  if (elapsed < MISSING_CAST_MS) {
    return "missing";
  }
  const round = getRound(elapsed);
  const spawnAt = MISSING_CAST_MS + (round - 1) * TOWER_INTERVAL_MS;
  if (round % 2 !== 0 || elapsed < spawnAt || elapsed > spawnAt + BOSS_CAST_MS) {
    return "";
  }
  return getEvenRoundCast(round, scenario);
}

function getEvenRoundCast(round: number, scenario: ScenarioConfig): "future" | "past" {
  return scenario.evenCasts[round] ?? "future";
}

function getScenarioValidation(elapsed: number, scenario: ScenarioConfig): ScenarioValidation {
  const results: RoundValidation[] = [];
  for (let round = 1; round <= TOWER_ROUNDS; round++) {
    const activateAt = MISSING_CAST_MS + (round - 1) * TOWER_INTERVAL_MS + TOWER_ACTIVATE_MS;
    if (elapsed < activateAt) {
      break;
    }
    results.push(validateRound(round, scenario));
  }
  return {
    failed: results.some((result) => !result.ok),
    completedRounds: results.length,
    results
  };
}

function validateRound(round: number, scenario: ScenarioConfig): RoundValidation {
  const activateAt = MISSING_CAST_MS + (round - 1) * TOWER_INTERVAL_MS + TOWER_ACTIVATE_MS;
  const positions = samplePositions(activateAt, scenario);
  const towers = getTowerPair(round, scenario);
  const markers = getRoundMarkers(round, scenario);
  const messages: string[] = [];
  const all = PLAYERS.map((player) => ({
    id: player.id,
    role: player.role,
    position: positions[player.role],
    marker: markers[player.role]
  }));
  const towerOccupants = towers.map((tower) =>
    all.filter((entry) => isInCircle(entry.position.x, entry.position.z, tower.x, tower.z, TOWER_RADIUS))
  );
  const towerSideByRole = new Map<PlayerRole, TowerSide>();

  towerOccupants.forEach((occupants, index) => {
    const side = towerSideLabel(index);
    for (const occupant of occupants) {
      towerSideByRole.set(occupant.role, side);
    }
    if (occupants.length !== TOWER_REQUIRED_OCCUPANTS) {
      messages.push(`${round}번 ${side} 인원 ${occupants.length}명 (${rolesText(occupants)} / 2명 필요)`);
    }
  });

  const towerRoles = new Set<PlayerRole>();
  for (const occupants of towerOccupants) {
    for (const occupant of occupants) {
      towerRoles.add(occupant.role);
    }
  }
  const towerPlayers = all.filter((entry) => towerRoles.has(entry.role));

  type Region =
    | { type: "circle"; ownerRole: PlayerRole; side: TowerSide; cx: number; cz: number; radius: number }
    | { type: "cone"; ownerRole: PlayerRole; side: TowerSide; cx: number; cz: number; dir: number };
  const regions: Region[] = [];

  for (const owner of towerPlayers) {
    const marker = owner.marker;
    const side = towerSideByRole.get(owner.role);
    if (!marker || !side) {
      continue;
    }
    if (marker === "share") {
      const count = all.filter((entry) =>
        isInCircle(entry.position.x, entry.position.z, owner.position.x, owner.position.z, SHARE_RADIUS)
      ).length;
      regions.push({ type: "circle", ownerRole: owner.role, side, cx: owner.position.x, cz: owner.position.z, radius: SHARE_RADIUS });
      if (count !== SHARE_REQUIRED) {
        messages.push(`${round}번 ${side} 쉐어징(${owner.role}) 인원 ${count}명 (3명 필요)`);
      }
      continue;
    }
    if (marker === "spread") {
      const extras = all.filter((entry) =>
        entry.role !== owner.role && isInCircle(entry.position.x, entry.position.z, owner.position.x, owner.position.z, SPREAD_RADIUS)
      );
      regions.push({ type: "circle", ownerRole: owner.role, side, cx: owner.position.x, cz: owner.position.z, radius: SPREAD_RADIUS });
      if (extras.length > 0) {
        messages.push(`${round}번 ${side} 산개징(${owner.role})에 ${extras.length}명 추가 피격: ${rolesText(extras)}`);
      }
      continue;
    }

    const target = nearestPosition(owner.role, positions);
    regions.push({
      type: "cone",
      ownerRole: owner.role,
      side,
      cx: owner.position.x,
      cz: owner.position.z,
      dir: target ? Math.atan2(target.x - owner.position.x, target.z - owner.position.z) : 0
    });
  }

  for (const entry of all) {
    let hits = 0;
    const sides = new Set<TowerSide>();
    for (const region of regions) {
      if (region.type === "circle") {
        if (isInCircle(entry.position.x, entry.position.z, region.cx, region.cz, region.radius)) {
          hits += 1;
          sides.add(region.side);
        }
      } else if (entry.role !== region.ownerRole && isInCone(entry.position.x, entry.position.z, region.cx, region.cz, region.dir, CONE_ANGLE, CONE_RANGE)) {
        hits += 1;
        sides.add(region.side);
      }
    }
    if (hits >= 2) {
      messages.push(`${round}번 ${Array.from(sides).join("/")} 범위 중첩: ${entry.role} ${hits}개 피격`);
    }
  }

  return {
    round,
    ok: messages.length === 0,
    messages
  };
}

function getLogs(elapsed: number, scenario: ScenarioConfig, validation: ScenarioValidation): string[] {
  const round = getRound(elapsed);
  const cast = getBossCast(elapsed, scenario);
  if (cast === "missing") {
    return ["[자동 공략] 보스 캐스팅: 행방불명", "[자동 공략] 광역 후 초기 머리징을 확인합니다."];
  }
  const logs = [
    `[자동 공략] 랜덤 패턴: 시작 ${directionName(scenario.baseIndex)} / ${scenario.rotationDirection === 1 ? "시계" : "반시계"} 회전`,
    `[자동 공략] ${round}번 탑 처리 중 (${rolesText(getMissingActiveRolesForRound(round, scenario.groupOneRoles).map((role) => ({ role })))})`,
    cast ? `[자동 공략] 보스 캐스팅: ${cast === "future" ? "미래의 종언" : "과거의 종언"}` : "[자동 공략] 탑 처리 위치 확인"
  ];
  for (const result of validation.results) {
    if (result.ok) {
      logs.push(`[공략 판정] ${result.round}번 탑 성공`);
      continue;
    }
    logs.push(`[공략 판정] ${result.round}번 탑 실패`);
    logs.push(...result.messages.map((message) => `[공략 판정] ${message}`));
  }
  if (validation.completedRounds === TOWER_ROUNDS && !validation.failed) {
    logs.push("[공략 판정] 행방불명 처리 성공");
  }
  return logs.slice(-12);
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
      return add(tower, scale(inward, 3.5));
    case "outer":
      return add(tower, scale(outward, 3.6));
    case "outerEdge":
      return add(tower, scale(outward, TOWER_RADIUS - 0.45));
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

function bossClockPointFromSix(sixDirection: Vec2, hour: 1 | 3 | 9 | 11, distance = BOSS_RADIUS + 0.35): Vec2 {
  const six = normalize(sixDirection);
  const twelve = scale(six, -1);
  const right = { x: -twelve.z, z: twelve.x };
  if (hour === 3) {
    return scale(right, distance);
  }
  if (hour === 9) {
    return scale(right, -distance);
  }
  const amount = Math.PI / 6;
  const sign = hour === 1 ? 1 : -1;
  const direction = add(scale(twelve, Math.cos(amount)), scale(right, Math.sin(amount) * sign));
  return scale(normalize(direction), distance);
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

function shuffle<T>(array: T[]): T[] {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = copy[i];
    const b = copy[j];
    if (a !== undefined && b !== undefined) {
      copy[i] = b;
      copy[j] = a;
    }
  }
  return copy;
}

function directionName(index: number): string {
  const names = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"];
  return names[((index % DIRECTION_COUNT) + DIRECTION_COUNT) % DIRECTION_COUNT] ?? "랜덤";
}

function towerSideLabel(index: number): TowerSide {
  return index === 0 ? "왼쪽탑" : "오른쪽탑";
}

function rolesText(entries: { role: PlayerRole }[]): string {
  return entries.map((entry) => entry.role).join(", ") || "없음";
}

function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, z: a.z + b.z };
}

function scale(a: Vec2, amount: number): Vec2 {
  return { x: a.x * amount, z: a.z * amount };
}

function movePointToward(point: Vec2, target: Vec2, amount: number): Vec2 {
  const direction = normalize({ x: target.x - point.x, z: target.z - point.z });
  return add(point, scale(direction, amount));
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
