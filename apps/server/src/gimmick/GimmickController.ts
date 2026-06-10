import {
  AOE_SHOW_MS,
  ARENA_RADIUS,
  BOSS_CAST_MS,
  CONE_ANGLE,
  CONE_RANGE,
  DEALER_ROLES,
  directionToPosition,
  DIRECTION_COUNT,
  isInCircle,
  isInCone,
  MARKER_CAP,
  MARKER_VISIBLE_MS,
  MISSING_CAST_MS,
  SHARE_RADIUS,
  SHARE_REQUIRED,
  SPREAD_RADIUS,
  TANK_HEALER_ROLES,
  TOWER_ACTIVATE_MS,
  TOWER_DISTANCE,
  TOWER_INTERVAL_MS,
  TOWER_RADIUS,
  TOWER_REQUIRED_OCCUPANTS,
  TOWER_ROUNDS,
  type MarkerType
} from "@raid-simulator/shared";
import type { RaidRoomState } from "../schemas/RaidRoomState.js";
import type { PlayerSchema } from "../schemas/PlayerSchema.js";
import { TowerSchema } from "../schemas/TowerSchema.js";
import { AoeSchema } from "../schemas/AoeSchema.js";

type ScheduledEvent = { at: number; fn: () => void; fired: boolean };
type StartOptions = { stopOnFailure?: boolean };
type TowerSide = "왼쪽탑" | "오른쪽탑";

const MAX_LOGS = 50;
const CLONE_BAIT_RADIUS = 4.5;
const CLONE_SPOT_RADIUS = 0.42;
const KICK_BAIT_RESOLVE_DELAY_MS = 3200;

export class GimmickController {
  private running = false;
  private schedule: ScheduledEvent[] = [];
  private idCounter = 0;
  private failed = false;
  private stopOnFailure = false;
  private stoppedByFailure = false;
  private baseIndex = 0;
  private rotDir = 1;

  constructor(private readonly state: RaidRoomState) {}

  start(gimmick: string, options: StartOptions = {}) {
    if (gimmick !== "missing") {
      return;
    }
    this.reset();
    this.running = true;
    this.stopOnFailure = options.stopOnFailure === true;
    this.stoppedByFailure = false;
    this.state.gimmick = "missing";
    this.state.gimmickPhase = "running";
    this.state.bossActive = true;
    this.state.bossCast = "missing";
    this.state.elapsed = 0;
    this.state.paused = false;
    this.failed = false;

    this.baseIndex = Math.floor(Math.random() * DIRECTION_COUNT);
    this.rotDir = Math.random() < 0.5 ? 1 : -1;
    this.state.missingBaseIndex = this.baseIndex;
    this.state.missingRotationDirection = this.rotDir;
    this.state.lastEvenBossCast = "";

    this.buildTimeline();
    this.log("보스 캐스팅: 행방불명");
  }

  stop() {
    this.reset();
    this.state.gimmick = "";
    this.state.gimmickPhase = "idle";
    this.state.bossActive = false;
    this.state.bossCast = "";
    this.state.lastEvenBossCast = "";
    this.state.round = 0;
    this.state.elapsed = 0;
    this.state.paused = false;
  }

  pause() {
    if (this.running && this.state.gimmickPhase === "running") {
      this.state.paused = true;
    }
  }

  resume() {
    if (this.running && this.state.gimmickPhase === "running") {
      this.state.paused = false;
    }
  }

  /** 매 시뮬레이션 틱마다 호출. dtMs만큼 시간을 진행하고 도래한 이벤트를 실행. */
  update(dtMs: number) {
    if (!this.running || this.state.paused) {
      return;
    }
    this.state.elapsed += dtMs;
    const elapsed = this.state.elapsed;
    // 새 이벤트가 동적으로 추가될 수 있으므로 인덱스 기반으로 순회.
    for (let i = 0; i < this.schedule.length; i++) {
      const event = this.schedule[i];
      if (event && !event.fired && event.at <= elapsed) {
        event.fired = true;
        event.fn();
      }
    }
  }

  // --- 내부 ---

  private reset() {
    this.running = false;
    this.schedule = [];
    this.idCounter = 0;
    this.stopOnFailure = false;
    this.stoppedByFailure = false;
    this.state.paused = false;
    this.state.controlsLocked = false;
    this.state.towers.clear();
    this.state.aoes.splice(0, this.state.aoes.length);
    this.state.logs.splice(0, this.state.logs.length);
    this.state.lastEvenBossCast = "";
    this.clearAllMarkers();
  }

  private nextId(prefix: string): string {
    this.idCounter += 1;
    return `${prefix}_${this.idCounter}`;
  }

  private scheduleAt(at: number, fn: () => void) {
    this.schedule.push({ at, fn, fired: false });
  }

  private log(message: string) {
    const seconds = (this.state.elapsed / 1000).toFixed(1);
    this.state.logs.push(`[${seconds}s] ${message}`);
    while (this.state.logs.length > MAX_LOGS) {
      this.state.logs.shift();
    }
  }

  private buildTimeline() {
    this.scheduleAt(MISSING_CAST_MS, () => {
      if (this.state.bossCast === "missing") {
        this.state.bossCast = "";
      }
      this.addAoe(this.makeCircleAoe("raidwide", 0, 0, ARENA_RADIUS));
      this.assignInitialMarkers();
      this.spawnTowers(1);
      this.log("광역 공격 완료 / 1차 머리징 부여");
    });
    this.scheduleAt(MISSING_CAST_MS + MARKER_VISIBLE_MS, () => this.hideMarkers(this.allPlayerIds()));

    for (let round = 1; round <= TOWER_ROUNDS; round++) {
      const spawnAt = MISSING_CAST_MS + (round - 1) * TOWER_INTERVAL_MS;
      const activateAt = spawnAt + TOWER_ACTIVATE_MS;

      if (round >= 2) {
        this.scheduleAt(spawnAt, () => this.spawnTowers(round));
      }
      // 짝수 탑: 생성과 동시에 보스 미래/과거 캐스팅(5초).
      if (round % 2 === 0) {
        this.scheduleAt(spawnAt, () => this.startBossCast(round));
        this.scheduleAt(activateAt + AOE_SHOW_MS + KICK_BAIT_RESOLVE_DELAY_MS, () => this.showCloneSpots(round));
      }
      this.scheduleAt(activateAt, () => this.resolveRound(round));
    }

    // 마지막 탑 처리 후 종료 판정.
    const endAt = MISSING_CAST_MS + (TOWER_ROUNDS - 1) * TOWER_INTERVAL_MS + TOWER_ACTIVATE_MS + 1500;
    this.scheduleAt(endAt, () => this.finish());
  }

  private players(): { id: string; p: PlayerSchema }[] {
    const list: { id: string; p: PlayerSchema }[] = [];
    this.state.players.forEach((p, id) => list.push({ id, p }));
    return list;
  }

  private allPlayerIds(): string[] {
    return this.players().map((entry) => entry.id);
  }

  private clearAllMarkers() {
    this.state.players.forEach((p) => {
      p.marker = "";
      p.markerVisible = false;
      p.priorityMarker = "";
      p.markerCount = 0;
    });
  }

  private giveMarker(p: PlayerSchema, marker: MarkerType) {
    if (p.markerCount >= MARKER_CAP) {
      // 4회 제한 도달: 새 징을 부여하지 않는다.
      p.marker = "";
      p.markerVisible = false;
      return;
    }
    p.marker = marker;
    p.markerVisible = true;
    p.markerCount += 1;
  }

  private hideMarkers(ids: string[]) {
    for (const id of ids) {
      const p = this.state.players.get(id);
      if (p) {
        p.markerVisible = false;
      }
    }
  }

  private assignInitialMarkers() {
    const all = this.players();
    const th = shuffle(all.filter((e) => (TANK_HEALER_ROLES as readonly string[]).includes(e.p.role)));
    const dps = shuffle(all.filter((e) => (DEALER_ROLES as readonly string[]).includes(e.p.role)));

    // 쉐어 2개: 탱힐 1, 딜 1
    if (th[0]) this.giveMarker(th[0].p, "share");
    if (dps[0]) this.giveMarker(dps[0].p, "share");

    const restTh = th.slice(1);
    const restDps = dps.slice(1);
    const patternA = Math.random() < 0.5;
    const thType: MarkerType = patternA ? "cone" : "spread";
    const dpsType: MarkerType = patternA ? "spread" : "cone";

    for (const e of restTh) this.giveMarker(e.p, thType);
    for (const e of restDps) this.giveMarker(e.p, dpsType);

    this.log(`머리징 부여(패턴 ${patternA ? "A" : "B"}): 쉐어2 / 부채꼴3 / 산개3`);
  }

  private spawnTowers(round: number) {
    this.state.round = round;
    this.state.towers.clear();
    const shift = (round - 1) * this.rotDir;
    const idxA = this.baseIndex + shift;
    const idxB = this.baseIndex + 2 + shift; // 90도 간격

    for (const idx of [idxA, idxB]) {
      const pos = directionToPosition(idx, TOWER_DISTANCE);
      const tower = new TowerSchema();
      tower.id = this.nextId("tower");
      tower.x = pos.x;
      tower.z = pos.z;
      tower.round = round;
      this.state.towers.set(tower.id, tower);
    }
    this.log(`${round}번 탑 등장 (8초 후 작동)`);
  }

  private startBossCast(round: number) {
    const cast = Math.random() < 0.5 ? "future" : "past";
    this.state.bossCast = cast;
    this.state.lastEvenBossCast = cast;
    this.log(`보스 캐스팅: ${cast === "future" ? "미래의 종언" : "과거의 종언"}`);
    const castEndsAt = this.state.elapsed + BOSS_CAST_MS;
    this.scheduleAt(castEndsAt, () => {
      // 다른 캐스팅이 시작되지 않았다면 비운다.
      if (this.state.bossCast === cast) {
        this.state.bossCast = "";
      }
    });
  }

  private addAoe(aoe: AoeSchema) {
    this.state.aoes.push(aoe);
    const expireAt = this.state.elapsed + AOE_SHOW_MS;
    this.scheduleAt(expireAt, () => {
      const index = this.state.aoes.findIndex((a) => a.id === aoe.id);
      if (index >= 0) {
        this.state.aoes.splice(index, 1);
      }
    });
  }

  private showCloneSpots(round: number) {
    if (round % 2 !== 0) {
      return;
    }
    const players = this.players()
      .sort((a, b) => Math.hypot(a.p.x, a.p.z) - Math.hypot(b.p.x, b.p.z))
      .slice(0, 4);
    for (const entry of players) {
      this.addAoe(this.makeCircleAoe("cloneSpot", entry.p.x, entry.p.z, CLONE_SPOT_RADIUS));
    }
    this.log(`${round}번 탑 이후 분신 위치 표시`);
  }

  private resolveRound(round: number) {
    const all = this.players();
    if (round % 2 === 0) {
      this.showCloneBaitCircles(all);
    }
    const towers: TowerSchema[] = [];
    this.state.towers.forEach((t) => towers.push(t));
    const sortedTowers = sortTowersByBossFacingLeftRight(towers);

    // --- 탑 인원 판정 ---
    const towerOccupants: { id: string; p: PlayerSchema }[][] = sortedTowers.map((tower) =>
      all.filter((e) => isInCircle(e.p.x, e.p.z, tower.x, tower.z, TOWER_RADIUS))
    );
    const towerSideByPlayerId = new Map<string, TowerSide>();
    towerOccupants.forEach((occupants, index) => {
      const side = towerSideLabel(index);
      for (const occupant of occupants) {
        towerSideByPlayerId.set(occupant.id, side);
      }
    });

    const towerFailures: string[] = [];
    sortedTowers.forEach((_tower, i) => {
      const occ = towerOccupants[i] ?? [];
      if (occ.length !== TOWER_REQUIRED_OCCUPANTS) {
        towerFailures.push(`${round}번 ${towerSideLabel(i)} 인원 ${occ.length}명 (${rolesText(occ)} / 2명 필요)`);
      }
    });
    if (towerFailures.length > 0) {
      for (const reason of towerFailures) {
        this.recordFailure(reason);
      }
      this.stopAfterFailureIfNeeded();
    }
    if (this.stoppedByFailure) {
      return;
    }

    // 탑에 들어간 플레이어(중복 제거)
    const towerPlayerIds = new Set<string>();
    for (const occ of towerOccupants) {
      for (const e of occ) towerPlayerIds.add(e.id);
    }
    const towerPlayers = all.filter((e) => towerPlayerIds.has(e.id));

    // --- 머리징 공격 판정(탑에 들어간 대상자) ---
    this.resolveMarkerAttacks(round, towerPlayers, all, towerSideByPlayerId);
    if (this.stoppedByFailure) {
      return;
    }

    // --- 머리징 재부여 ---
    this.reassignMarkers(round, towerPlayers);

    this.log(`${round}번 탑 작동 / 머리징 공격·재부여 완료`);
  }

  private showCloneBaitCircles(all: { id: string; p: PlayerSchema }[]) {
    const targets = [...all].sort((a, b) => Math.hypot(a.p.x, a.p.z) - Math.hypot(b.p.x, b.p.z)).slice(0, 4);
    for (const target of targets) {
      this.addAoe(this.makeCircleAoe("clone", target.p.x, target.p.z, CLONE_BAIT_RADIUS));
    }
  }

  private resolveMarkerAttacks(
    round: number,
    towerPlayers: { id: string; p: PlayerSchema }[],
    all: { id: string; p: PlayerSchema }[],
    towerSideByPlayerId: Map<string, TowerSide>
  ) {
    type Region =
      | { type: "circle"; kind: MarkerType; ownerId: string; side: TowerSide; cx: number; cz: number; r: number }
      | { type: "cone"; kind: "cone"; ownerId: string; side: TowerSide; cx: number; cz: number; dir: number };

    const regions: Region[] = [];
    const validations: (() => void)[] = [];

    for (const owner of towerPlayers) {
      const marker = owner.p.marker as MarkerType | "";
      const ownerSide = towerSideByPlayerId.get(owner.id);
      if (!ownerSide) {
        continue;
      }
      if (marker === "share") {
        regions.push({ type: "circle", kind: "share", ownerId: owner.id, side: ownerSide, cx: owner.p.x, cz: owner.p.z, r: SHARE_RADIUS });
        this.addAoe(this.makeCircleAoe("share", owner.p.x, owner.p.z, SHARE_RADIUS));
        validations.push(() => {
          const count = all.filter((e) => isInCircle(e.p.x, e.p.z, owner.p.x, owner.p.z, SHARE_RADIUS)).length;
          if (count !== SHARE_REQUIRED) {
            this.failRound(`${round}번 ${ownerSide} 쉐어징(${owner.p.role}) 인원 ${count}명 (3명 필요)`);
          }
        });
      } else if (marker === "spread") {
        regions.push({ type: "circle", kind: "spread", ownerId: owner.id, side: ownerSide, cx: owner.p.x, cz: owner.p.z, r: SPREAD_RADIUS });
        this.addAoe(this.makeCircleAoe("spread", owner.p.x, owner.p.z, SPREAD_RADIUS));
        validations.push(() => {
          const others = all.filter((e) => e.id !== owner.id && isInCircle(e.p.x, e.p.z, owner.p.x, owner.p.z, SPREAD_RADIUS));
          if (others.length > 0) {
            this.failRound(`${round}번 ${ownerSide} 산개징(${owner.p.role})에 ${others.length}명 추가 피격`);
          }
        });
      } else if (marker === "cone") {
        const nearest = nearestOther(owner, all);
        const dir = nearest ? Math.atan2(nearest.p.x - owner.p.x, nearest.p.z - owner.p.z) : 0;
        regions.push({ type: "cone", kind: "cone", ownerId: owner.id, side: ownerSide, cx: owner.p.x, cz: owner.p.z, dir });
        this.addAoe(this.makeConeAoe(owner.p.x, owner.p.z, dir));
      }
    }

    for (const validate of validations) {
      validate();
      if (this.stoppedByFailure) {
        return;
      }
    }

    // --- 중첩 판정: 한 플레이어가 2개 이상 범위에 포함되면 즉사 ---
    for (const q of all) {
      let hits = 0;
      const hitSides: TowerSide[] = [];
      for (const region of regions) {
        if (region.type === "circle") {
          if (isInCircle(q.p.x, q.p.z, region.cx, region.cz, region.r)) {
            hits += 1;
            hitSides.push(region.side);
          }
        } else {
          // 부채꼴 대상자 본인은 자기 부채꼴에 포함되지 않는다.
          if (q.id !== region.ownerId && isInCone(q.p.x, q.p.z, region.cx, region.cz, region.dir, CONE_ANGLE, CONE_RANGE)) {
            hits += 1;
            hitSides.push(region.side);
          }
        }
      }
      if (hits >= 2) {
        const sides = Array.from(new Set(hitSides)).join("/");
        this.failRound(`${round}번 ${sides} 범위 중첩: ${q.p.role} ${hits}개 피격`);
        if (this.stoppedByFailure) {
          return;
        }
      }
    }
  }

  private makeCircleAoe(kind: "share" | "spread" | "raidwide" | "clone" | "cloneSpot", x: number, z: number, radius: number): AoeSchema {
    const aoe = new AoeSchema();
    aoe.id = this.nextId("aoe");
    aoe.kind = kind;
    aoe.x = x;
    aoe.z = z;
    aoe.radius = radius;
    return aoe;
  }

  private makeConeAoe(x: number, z: number, dir: number): AoeSchema {
    const aoe = new AoeSchema();
    aoe.id = this.nextId("aoe");
    aoe.kind = "cone";
    aoe.x = x;
    aoe.z = z;
    aoe.dir = dir;
    aoe.angle = CONE_ANGLE;
    aoe.range = CONE_RANGE;
    return aoe;
  }

  private reassignMarkers(round: number, towerPlayers: { id: string; p: PlayerSchema }[]) {
    if (towerPlayers.length === 0) {
      return;
    }
    const shareCount = towerPlayers.filter((e) => e.p.marker === "share").length;
    // 조건 A: 쉐어 2개 → 부채꼴2 + 산개2 / 조건 B: 그 외 → 부채꼴1 + 산개1 + 쉐어2
    const pool: MarkerType[] =
      shareCount === 2 ? ["cone", "cone", "spread", "spread"] : ["cone", "spread", "share", "share"];
    const shuffledPool = shuffle(pool);
    const shuffledTargets = shuffle([...towerPlayers]);

    let poolIndex = 0;
    for (const target of shuffledTargets) {
      const marker = shuffledPool[poolIndex];
      if (!marker) {
        target.p.marker = "";
        target.p.markerVisible = false;
        continue;
      }
      this.giveMarker(target.p, marker);
      poolIndex += 1;
    }

    const reassignedIds = shuffledTargets.map((e) => e.id);
    this.scheduleAt(this.state.elapsed + MARKER_VISIBLE_MS, () => {
      this.hideMarkers(reassignedIds);
      if (round === 3) {
        this.assignFinalPriorityMarkers(towerPlayers);
      }
    });
  }

  private assignFinalPriorityMarkers(towerPlayers: { id: string; p: PlayerSchema }[]) {
    const cones = shuffle(towerPlayers.filter((e) => e.p.marker === "cone"));
    const spreads = shuffle(towerPlayers.filter((e) => e.p.marker === "spread"));
    const numberMarkers = ["number1", "number2"] as const;
    const forbidMarkers = ["forbid1", "forbid2"] as const;

    cones.forEach((entry, index) => {
      entry.p.priorityMarker = numberMarkers[index] ?? "";
    });
    spreads.forEach((entry, index) => {
      entry.p.priorityMarker = forbidMarkers[index] ?? "";
    });
  }

  private failRound(reason: string) {
    this.recordFailure(reason);
    this.stopAfterFailureIfNeeded();
  }

  private recordFailure(reason: string) {
    this.failed = true;
    this.log(`❌ 실패: ${reason}`);
  }

  private stopAfterFailureIfNeeded() {
    if (this.stopOnFailure && !this.stoppedByFailure) {
      this.stoppedByFailure = true;
      this.running = false;
      this.state.paused = false;
      this.state.gimmickPhase = "failed";
      this.state.bossCast = "";
      this.state.controlsLocked = true;
      this.log("기믹 중단: 실패시 중단 옵션 (플레이어 컨트롤 정지)");
    }
  }

  private finish() {
    this.running = false;
    this.state.paused = false;
    this.state.towers.clear();
    this.state.bossCast = "";
    this.state.gimmickPhase = this.failed ? "failed" : "success";
    this.log(this.failed ? "기믹 종료: 일부 실패 포함" : "✅ 기믹 성공: 8번 탑까지 통과");
  }
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

function nearestOther(
  owner: { id: string; p: PlayerSchema },
  all: { id: string; p: PlayerSchema }[]
): { id: string; p: PlayerSchema } | null {
  let best: { id: string; p: PlayerSchema } | null = null;
  let bestDist = Infinity;
  for (const e of all) {
    if (e.id === owner.id) continue;
    const d = Math.hypot(e.p.x - owner.p.x, e.p.z - owner.p.z);
    if (d < bestDist) {
      bestDist = d;
      best = e;
    }
  }
  return best;
}

function towerSideLabel(index: number): TowerSide {
  return index === 0 ? "왼쪽탑" : "오른쪽탑";
}

function rolesText(entries: { p: PlayerSchema }[]): string {
  const roles = entries.map((entry) => entry.p.role).join(", ");
  return roles || "없음";
}

function sortTowersByBossFacingLeftRight<T extends { x: number; z: number }>(towers: T[]): T[] {
  if (towers.length !== 2 || !towers[0] || !towers[1]) {
    return towers;
  }
  const [a, b] = towers;
  const midpoint = scale2(add2(a, b), 0.5);
  const forwardToBoss = normalize2(scale2(midpoint, -1));
  const leftSide = { x: -forwardToBoss.z, z: forwardToBoss.x };
  return dot2(a, leftSide) < dot2(b, leftSide) ? [a, b] : [b, a];
}

function add2(a: { x: number; z: number }, b: { x: number; z: number }): { x: number; z: number } {
  return { x: a.x + b.x, z: a.z + b.z };
}

function scale2(a: { x: number; z: number }, amount: number): { x: number; z: number } {
  return { x: a.x * amount, z: a.z * amount };
}

function normalize2(a: { x: number; z: number }): { x: number; z: number } {
  const length = Math.hypot(a.x, a.z) || 1;
  return { x: a.x / length, z: a.z / length };
}

function dot2(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return a.x * b.x + a.z * b.z;
}
