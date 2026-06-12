import { PLAYER_ROLES, type PlayerRole } from "@raid-simulator/shared";

// P3 주사위 공략보기(재생). 보스 공격(알테마 블래스터/주사위 유도) 텔레그래프 +
// 그 안전지대로 서는 위치를 매 판 랜덤 구성에서 '계산'으로 생성한다.

type Vec2 = { x: number; z: number };
export type DiceAttack = {
  kind: "rect" | "circle" | "stack";
  x: number;
  z: number;
  radius?: number;
  dir?: number;
  length?: number;
  width?: number;
};
export type DiceSample = {
  positions: Record<PlayerRole, Vec2>;
  attacks: DiceAttack[];
  diceByRole: Record<PlayerRole, number>;
  label: string;
};
export type DiceConfig = {
  bossIndex: number; // 보스가 선 8방향(0=북, 시계 45°)
  startIndex: number; // 1번 블래스터가 시작되는 외곽 방향
  rotDir: 1 | -1; // 블래스터 회전 방향
  diceByRole: Record<PlayerRole, number>; // 역할 → 주사위 1~8
};

const ARENA = 20;
const EDGE = 19; // 산개 시 맵 끝(아레나 안쪽)
const WAY = 13; // 웨이마크 거리(= 보스 위치 거리)
const BOSS_R = 5; // 보스 반지름(지름 10m)
const BLAST_W = 8; // 알테마 블래스터/주사위 직선 폭
const STACK_R = 6; // 연두 장판 반지름

const FIRST_MS = 3000;
const GAP_MS = 2000;
const blastAt = (k: number) => FIRST_MS + (k - 1) * GAP_MS; // #1=3s … #8=17s
const KNOCK_MS = blastAt(4); // 9s
const PUDDLE_MS = KNOCK_MS + 1000; // 10s
const DICE_ASSIGN_MS = blastAt(6); // 13s
const DICE_FIRE_START_MS = blastAt(8) + 5000; // 22s
const DICE_FIRE_GAP_MS = 1000;
export const DICE_TOTAL_MS = DICE_FIRE_START_MS + 8 * DICE_FIRE_GAP_MS + 2000; // ~32s

function angleOf(index: number): number {
  return ((index % 8) + 8) % 8 * (Math.PI / 4);
}
function posAngle(angle: number, dist: number): Vec2 {
  return { x: dist * Math.sin(angle), z: -dist * Math.cos(angle) };
}
function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, z: a.z + b.z };
}

export function createDiceConfig(): DiceConfig {
  const roles = [...PLAYER_ROLES];
  // 1~8 셔플 → 역할에 배정
  const nums = [1, 2, 3, 4, 5, 6, 7, 8];
  for (let i = nums.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = nums[i]!;
    nums[i] = nums[j]!;
    nums[j] = t;
  }
  const diceByRole = {} as Record<PlayerRole, number>;
  roles.forEach((role, i) => (diceByRole[role] = nums[i]!));
  return {
    bossIndex: Math.floor(Math.random() * 8),
    startIndex: Math.floor(Math.random() * 8),
    rotDir: Math.random() < 0.5 ? 1 : -1,
    diceByRole
  };
}

// 주사위 d번(1~8)이 서는 맵끝 위치.
function dicePosition(d: number, config: DiceConfig): Vec2 {
  const arrivalAngle = angleOf(config.startIndex + 4); // #1 도착점 = 12시
  const angle = arrivalAngle - config.rotDir * (Math.PI / 8 + (d - 1) * (Math.PI / 4));
  return posAngle(angle, EDGE);
}

// 역할별 위치 키프레임(보스 안쪽 → 넉백 → 중앙 쉐어 → 주사위 산개).
function roleKeyframes(role: PlayerRole, config: DiceConfig): { t: number; pos: Vec2 }[] {
  const idx = PLAYER_ROLES.indexOf(role);
  const off = posAngle((idx / 8) * Math.PI * 2, 1.6); // 겹침 방지용 소폭 오프셋
  const bossAngle = angleOf(config.bossIndex);
  const stack = add(posAngle(bossAngle, WAY - BOSS_R), off); // 보스 안쪽 가장자리(중심거리 8m)
  const knocked = add(posAngle(bossAngle, Math.max(0, WAY - BOSS_R - 5)), off); // 5m 넉백 → 3m
  const center = add({ x: 0, z: 0 }, off);
  const dice = dicePosition(config.diceByRole[role], config);
  return [
    { t: 0, pos: stack },
    { t: KNOCK_MS, pos: stack },
    { t: KNOCK_MS + 800, pos: knocked },
    { t: PUDDLE_MS + 500, pos: center },
    { t: blastAt(8), pos: center },
    { t: DICE_FIRE_START_MS - 1000, pos: dice },
    { t: DICE_TOTAL_MS, pos: dice }
  ];
}

function lerp(a: Vec2, b: Vec2, f: number): Vec2 {
  return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f };
}
function sampleKeyframes(frames: { t: number; pos: Vec2 }[], t: number): Vec2 {
  if (t <= frames[0]!.t) return frames[0]!.pos;
  for (let i = 1; i < frames.length; i++) {
    if (t <= frames[i]!.t) {
      const a = frames[i - 1]!;
      const b = frames[i]!;
      const span = b.t - a.t || 1;
      return lerp(a.pos, b.pos, (t - a.t) / span);
    }
  }
  return frames[frames.length - 1]!.pos;
}

function currentAttacks(t: number, config: DiceConfig): DiceAttack[] {
  const attacks: DiceAttack[] = [];

  // 회전 알테마 블래스터(#1~#8): 폭 8m 직선이 외곽→중앙관통→반대끝.
  for (let k = 1; k <= 8; k++) {
    const fire = blastAt(k);
    if (t >= fire && t <= fire + 1000) {
      const startIdx = config.startIndex + (k - 1) * config.rotDir;
      const origin = posAngle(angleOf(startIdx), ARENA);
      attacks.push({ kind: "rect", x: origin.x, z: origin.z, dir: angleOf(startIdx + 4), length: ARENA * 2, width: BLAST_W });
    }
  }

  // 연두 장판(중앙 6m 쉐어).
  if (t >= PUDDLE_MS && t <= DICE_ASSIGN_MS + 1000) {
    attacks.push({ kind: "stack", x: 0, z: 0, radius: STACK_R });
  }

  // 주사위 유도: #1 시작점에서 대상자 방향으로 직선(맵끝까지), 1~8 순차.
  const origin = posAngle(angleOf(config.startIndex), ARENA);
  for (let d = 1; d <= 8; d++) {
    const fire = DICE_FIRE_START_MS + (d - 1) * DICE_FIRE_GAP_MS;
    if (t >= fire && t <= fire + 800) {
      const target = dicePosition(d, config);
      const dir = Math.atan2(target.x - origin.x, target.z - origin.z);
      attacks.push({ kind: "rect", x: origin.x, z: origin.z, dir, length: ARENA * 2.2, width: BLAST_W });
    }
  }

  return attacks;
}

function labelFor(t: number): string {
  if (t < blastAt(1)) return "집결 (보스 안쪽)";
  if (t < KNOCK_MS) return "알테마 블래스터 회전 (#1~#3)";
  if (t < PUDDLE_MS) return "4번째 발사 — 넉백 5m";
  if (t < DICE_ASSIGN_MS) return "연두 장판 — 중앙 집결 쉐어 (#5)";
  if (t < blastAt(8)) return "주사위 1~8 부여 (#6) + 회전 블래스터 #7·#8";
  if (t < DICE_FIRE_START_MS) return "주사위 유도 위치로 산개 (웨이마크 사이 맵끝)";
  return "주사위 유도 — 1~8 순차 발사, 각자 1대만";
}

export function sampleDice(elapsedMs: number, config: DiceConfig): DiceSample {
  const t = Math.max(0, Math.min(DICE_TOTAL_MS, elapsedMs));
  const positions = {} as Record<PlayerRole, Vec2>;
  for (const role of PLAYER_ROLES) {
    positions[role] = sampleKeyframes(roleKeyframes(role, config), t);
  }
  return { positions, attacks: currentAttacks(t, config), diceByRole: config.diceByRole, label: labelFor(t) };
}
