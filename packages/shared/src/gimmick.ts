// 보스 기믹 공통 상수 / 타입 / 기하 헬퍼.
// "행방불명" 기믹 1단계(탑 + 머리징) 구현용. 분신/발차기는 2단계.

export type MarkerType = "share" | "spread" | "cone";
export type PriorityMarkerType = "number1" | "number2" | "forbid1" | "forbid2";
export type BossCast = "" | "missing" | "future" | "past";
export type GimmickPhase = "idle" | "running" | "success" | "failed";
export type GimmickId = "missing";

// --- 보스 / 아레나 ---
export const BOSS_RADIUS = 6.5; // 히트박스 반지름(지름 13m)

// --- 탑 ---
export const TOWER_RADIUS = 4; // 판정 반지름(지름 8m)
export const TOWER_DISTANCE = 8.5; // 중심에서 탑까지 거리
export const TOWER_ACTIVATE_MS = 8000; // 생성 후 작동까지
export const TOWER_INTERVAL_MS = 10000; // 탑 등장 간격
export const TOWER_ROUNDS = 8; // 총 반복 횟수
export const TOWER_REQUIRED_OCCUPANTS = 2; // 탑당 정원

// --- 머리징 공격 범위 ---
export const SHARE_RADIUS = 4.5; // 쉐어 반지름(지름 9m), 정확히 3명
export const SHARE_REQUIRED = 3;
export const SPREAD_RADIUS = 4; // 산개 반지름(지름 8m), 혼자
export const CONE_ANGLE = Math.PI / 2; // 부채꼴 90도
export const CONE_RANGE = 20; // 부채꼴 사거리

// --- 타이밍 ---
export const MISSING_CAST_MS = 3000; // 기믹 시작 광역 캐스팅
export const MARKER_VISIBLE_MS = 5000; // 머리징 표시 시간
export const AOE_SHOW_MS = 1000; // 공격 범위 표시 시간
export const BOSS_CAST_MS = 5000; // 미래/과거 캐스팅 시간
export const MARKER_CAP = 4; // 1인당 최대 징 부여 횟수

// 8방향(북 기준 시계방향). A 웨이마크 = 북 = -Z.
// 위치 = (dist * sin(a), -dist * cos(a)), a = index * 45도.
export const DIRECTION_COUNT = 8;
export const DIRECTION_STEP = (Math.PI * 2) / DIRECTION_COUNT;

export function directionToPosition(index: number, distance: number): { x: number; z: number } {
  const a = ((index % DIRECTION_COUNT) + DIRECTION_COUNT) % DIRECTION_COUNT * DIRECTION_STEP;
  return { x: distance * Math.sin(a), z: -distance * Math.cos(a) };
}

// --- 기하 헬퍼 ---
export function distance2D(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

export function isInCircle(px: number, pz: number, cx: number, cz: number, radius: number): boolean {
  return distance2D(px, pz, cx, cz) <= radius;
}

/** apex에서 dir 방향으로 angle(전체 각) 부채꼴, range 안에 점이 있는지. */
export function isInCone(
  px: number,
  pz: number,
  apexX: number,
  apexZ: number,
  dir: number,
  angle: number,
  range: number
): boolean {
  const dx = px - apexX;
  const dz = pz - apexZ;
  const dist = Math.hypot(dx, dz);
  if (dist === 0 || dist > range) {
    return false;
  }
  const pointAngle = Math.atan2(dx, dz); // movement과 동일 규약(atan2(x,z))
  let diff = pointAngle - dir;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // [-PI, PI]
  return Math.abs(diff) <= angle / 2;
}

export const TANK_HEALER_ROLES = ["MT", "ST", "H1", "H2"] as const;
export const DEALER_ROLES = ["D1", "D2", "D3", "D4"] as const;
