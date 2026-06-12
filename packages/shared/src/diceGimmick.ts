import { ARENA_RADIUS } from "./constants.js";
import { PLAYER_ROLES, type PlayerRole } from "./roles.js";
import type { Vector2Like } from "./types.js";

// P3 주사위 기믹: 보스 공격(알테마 블래스터/주사위 유도) + 위치/판정.
// 공략보기(클라)·라이브(서버)·봇이 공유하는 순수 로직.

export type DiceConfig = {
  bossIndex: number; // 보스가 선 8방향(0=북, 시계 45°)
  startIndex: number; // 1번 블래스터가 시작되는 외곽 방향
  rotDir: 1 | -1; // 블래스터 회전 방향
  diceByRole: Record<PlayerRole, number>; // 역할 → 주사위 1~8
};
export type DiceAttack = {
  kind: "blaster" | "stack" | "rect";
  x: number;
  z: number;
  radius?: number;
  dir?: number;
  width?: number;
  length?: number;
  danger?: boolean;
};

const ARENA = ARENA_RADIUS; // 20
const EDGE = ARENA_RADIUS - 1; // 19
const WAY = 13;
const BOSS_R = 5;
const BLAST_W = 10; // 알테마 블래스터 폭(#1~16 공통). 기존 8m + 2m
const STACK_R = 6;

const FIRST_MS = 3000;
const GAP_MS = 2000;
export const diceBlastAt = (k: number) => FIRST_MS + (k - 1) * GAP_MS; // #1=3s … #8=17s
export const DICE_KNOCK_MS = diceBlastAt(4); // 9s
export const DICE_ASSIGN_MS = diceBlastAt(5); // 11s
const GREEN_MS = diceBlastAt(6); // 13s
export const DICE_FIRE_MS = diceBlastAt(8) + 8000; // 25s — #9~16 동시 직선(+2s 여유)
export const DICE_FIRE_SHOW_MS = 2000;
export const DICE_BOSS_RADIUS = BOSS_R;
export const DICE_GATHER_MS = 4000; // 성공 후 가운데 집결 시간
export const DICE_JUDGE_MS = DICE_FIRE_MS + DICE_FIRE_SHOW_MS; // 27s 판정 시점
export const DICE_TOTAL_MS = DICE_JUDGE_MS + DICE_GATHER_MS; // ~31s

function angleOf(index: number): number {
  return ((((index % 8) + 8) % 8) * Math.PI) / 4;
}
function posAngle(angle: number, dist: number): Vector2Like {
  return { x: dist * Math.sin(angle), z: -dist * Math.cos(angle) };
}
function add(a: Vector2Like, b: Vector2Like): Vector2Like {
  return { x: a.x + b.x, z: a.z + b.z };
}
function lerp(a: Vector2Like, b: Vector2Like, f: number): Vector2Like {
  return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f };
}

export function diceBossPosition(config: DiceConfig): Vector2Like {
  return posAngle(angleOf(config.bossIndex), WAY);
}

export function createDiceConfig(): DiceConfig {
  const nums = [1, 2, 3, 4, 5, 6, 7, 8];
  for (let i = nums.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = nums[i]!;
    nums[i] = nums[j]!;
    nums[j] = t;
  }
  const diceByRole = {} as Record<PlayerRole, number>;
  PLAYER_ROLES.forEach((role, i) => (diceByRole[role] = nums[i]!));
  return {
    bossIndex: Math.floor(Math.random() * 8),
    startIndex: Math.floor(Math.random() * 8),
    rotDir: Math.random() < 0.5 ? 1 : -1,
    diceByRole
  };
}

// 주사위 d번(1~8)이 서는 맵끝 위치.
function dicePosition(d: number, config: DiceConfig): Vector2Like {
  const arrivalAngle = angleOf(config.startIndex + 4); // #1 도착점 = 12시
  const angle = arrivalAngle - config.rotDir * (Math.PI / 8 + (d - 1) * (Math.PI / 4));
  return posAngle(angle, EDGE);
}

function roleOffset(role: PlayerRole): Vector2Like {
  return posAngle((PLAYER_ROLES.indexOf(role) / 8) * Math.PI * 2, 1.6);
}

// 역할의 최종 주사위 자리(판정 위치). 봇 직행 목표.
export function diceFinalPosition(role: PlayerRole, config: DiceConfig): Vector2Like {
  return dicePosition(config.diceByRole[role], config);
}

// 성공 후 가운데 집결 위치(역할별 소폭 오프셋).
export function diceGatherPosition(role: PlayerRole): Vector2Like {
  return roleOffset(role);
}

// #9~16 직선(주사위 d번): 시작점(8→1 순서) → 대상 방향, 반대편 맵끝까지.
export function diceLine(d: number, config: DiceConfig): { start: Vector2Like; dir: number; length: number } {
  const start = posAngle(angleOf(config.startIndex + (8 - d) * config.rotDir), ARENA);
  const target = dicePosition(d, config);
  const dir = Math.atan2(target.x - start.x, target.z - start.z);
  const ux = Math.sin(dir);
  const uz = Math.cos(dir);
  const chord = -2 * (start.x * ux + start.z * uz);
  return { start, dir, length: chord > 1 ? chord : ARENA * 2 };
}

function roleKeyframes(role: PlayerRole, config: DiceConfig): { t: number; pos: Vector2Like }[] {
  const off = roleOffset(role);
  const bossAngle = angleOf(config.bossIndex);
  const stack = add(posAngle(bossAngle, WAY - BOSS_R), off);
  const knocked = add(posAngle(bossAngle, WAY - BOSS_R - 10), off);
  const center = off;
  const dice = dicePosition(config.diceByRole[role], config);
  return [
    { t: 0, pos: stack },
    { t: DICE_KNOCK_MS, pos: stack },
    { t: DICE_KNOCK_MS + 500, pos: knocked },
    { t: GREEN_MS - 500, pos: center },
    { t: diceBlastAt(8), pos: center },
    { t: DICE_FIRE_MS - 1000, pos: dice },
    { t: DICE_JUDGE_MS, pos: dice }, // 직선 표시·판정 동안 자리 유지
    { t: DICE_TOTAL_MS, pos: center } // 성공 후 가운데 집결
  ];
}

function sampleKeyframes(frames: { t: number; pos: Vector2Like }[], t: number): Vector2Like {
  if (t <= frames[0]!.t) return frames[0]!.pos;
  for (let i = 1; i < frames.length; i++) {
    if (t <= frames[i]!.t) {
      const a = frames[i - 1]!;
      const b = frames[i]!;
      return lerp(a.pos, b.pos, (t - a.t) / (b.t - a.t || 1));
    }
  }
  return frames[frames.length - 1]!.pos;
}

export function diceRolePosition(role: PlayerRole, elapsed: number, config: DiceConfig): Vector2Like {
  return sampleKeyframes(roleKeyframes(role, config), Math.max(0, Math.min(DICE_TOTAL_MS, elapsed)));
}

export function diceAttacks(elapsed: number, config: DiceConfig): DiceAttack[] {
  const t = Math.max(0, Math.min(DICE_TOTAL_MS, elapsed));
  const attacks: DiceAttack[] = [];

  for (let k = 1; k <= 8; k++) {
    const fire = diceBlastAt(k);
    if (t >= fire && t <= fire + 1000) {
      const startIdx = config.startIndex + (k - 1) * config.rotDir;
      const origin = posAngle(angleOf(startIdx), ARENA);
      const target = posAngle(angleOf(startIdx + 4), ARENA);
      const pos = lerp(origin, target, (t - fire) / 1000);
      const dir = Math.atan2(target.x - origin.x, target.z - origin.z);
      attacks.push({ kind: "blaster", x: pos.x, z: pos.z, dir, width: BLAST_W });
    }
  }

  if (t >= GREEN_MS && t <= GREEN_MS + 1500) {
    attacks.push({ kind: "stack", x: 0, z: 0, radius: STACK_R });
  }

  if (t >= DICE_FIRE_MS && t <= DICE_FIRE_MS + DICE_FIRE_SHOW_MS) {
    for (let d = 1; d <= 8; d++) {
      const line = diceLine(d, config);
      attacks.push({ kind: "rect", x: line.start.x, z: line.start.z, dir: line.dir, length: line.length, width: BLAST_W, danger: true });
    }
  }

  return attacks;
}

export function diceVisibleAt(elapsed: number): boolean {
  return elapsed >= DICE_ASSIGN_MS;
}

export function diceLabel(elapsed: number): string {
  if (elapsed < diceBlastAt(1)) return "집결 (보스 안쪽)";
  if (elapsed < DICE_KNOCK_MS) return "알테마 블래스터 회전 (#1~#3)";
  if (elapsed < DICE_ASSIGN_MS) return "4번째 발사 — 보스 기준 10m 넉백";
  if (elapsed < GREEN_MS) return "5번째 발사 — 주사위 1~8 부여";
  if (elapsed < diceBlastAt(8)) return "6번째 발사 — 연두 장판 중앙 쉐어 (+#7)";
  if (elapsed < DICE_FIRE_MS) return "#8 후 — 주사위 위치로 산개(웨이마크 사이 맵끝)";
  return "9~16번 알테마 블래스터 — 주사위 방향 빨간 직선(동시)";
}

// 점이 직선 범위 안에 있는지(시작점에서 dir 방향, length·width).
function pointInLine(p: Vector2Like, start: Vector2Like, dir: number, length: number, width: number): boolean {
  const ux = Math.sin(dir);
  const uz = Math.cos(dir);
  const dx = p.x - start.x;
  const dz = p.z - start.z;
  const along = dx * ux + dz * uz;
  const side = dx * uz - dz * ux; // 수직 성분
  return along >= 0 && along <= length && Math.abs(side) <= width / 2;
}

// 각 위치가 #9~16 직선 중 몇 개에 맞는지. 정확히 1이면 성공.
export function diceHitCount(pos: Vector2Like, config: DiceConfig): number {
  let hits = 0;
  for (let d = 1; d <= 8; d++) {
    const line = diceLine(d, config);
    if (pointInLine(pos, line.start, line.dir, line.length, BLAST_W)) hits += 1;
  }
  return hits;
}
