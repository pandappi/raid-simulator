import { stepMovement, type ClientInput, type MovementState } from "@raid-simulator/shared";

// 상대 플레이어를 과거 시점으로 렌더링해 부드러운 보간을 확보(ms).
const INTERP_DELAY = 100;
// 스냅샷이 끊겼을 때 속도로 외삽할 수 있는 최대 시간(ms).
const MAX_EXTRAP = 120;
// 스냅샷 버퍼 보관 시간(ms).
const BUFFER_MS = 1000;
// 멈춰 있을 때 예측 위치를 서버 권위 위치로 정렬하는 강도.
const RECONCILE_LAMBDA = 8;
// 이 거리 이상 어긋나면(텔레포트/디싱크) 즉시 스냅(m).
const SNAP_THRESHOLD = 2;

type Snap = { t: number; x: number; z: number; rotation: number };

const buffers = new Map<string, Snap[]>();
let selfId: string | null = null;
let selfPredicted: MovementState | null = null;
let selfServer: MovementState | null = null;
// 서버 권위 위치가 아직 움직이는 중인지(정지 입력을 처리하기 전인지) 추적.
let selfServerMoving = false;

const moveInput: ClientInput = {
  up: false,
  down: false,
  left: false,
  right: false,
  cameraYaw: Math.PI
};

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : 0;
}

export function setSelfId(id: string | null) {
  selfId = id;
}

export function setMoveInput(input: { up: boolean; down: boolean; left: boolean; right: boolean }) {
  moveInput.up = input.up;
  moveInput.down = input.down;
  moveInput.left = input.left;
  moveInput.right = input.right;
}

export function resetNetcode() {
  buffers.clear();
  selfPredicted = null;
  selfServer = null;
  selfServerMoving = false;
  selfId = null;
  moveInput.up = moveInput.down = moveInput.left = moveInput.right = false;
}

export function dropPlayer(id: string) {
  buffers.delete(id);
}

/** 서버에서 도착한 위치 스냅샷을 버퍼에 적재한다. */
export function ingestSnapshot(id: string, x: number, z: number, rotation: number) {
  const t = now();
  let buf = buffers.get(id);
  if (!buf) {
    buf = [];
    buffers.set(id, buf);
  }
  buf.push({ t, x, z, rotation });

  const cutoff = t - BUFFER_MS;
  while (buf.length > 2 && (buf[0]?.t ?? Infinity) < cutoff) {
    buf.shift();
  }

  if (id === selfId) {
    if (selfServer) {
      const moved = Math.hypot(x - selfServer.x, z - selfServer.z);
      selfServerMoving = moved > 0.02;
    }
    selfServer = { x, z, rotation };
    if (!selfPredicted) {
      selfPredicted = { x, z, rotation };
    }
  }
}

/**
 * 자기 캐릭터: 보유 중인 입력으로 즉시 예측 이동 후, 서버 권위 위치로 부드럽게 보정.
 */
export function stepSelf(dt: number, cameraYaw: number): MovementState | null {
  if (!selfPredicted) {
    return selfServer;
  }

  moveInput.cameraYaw = cameraYaw;
  const next = stepMovement(selfPredicted, moveInput, dt);

  if (selfServer) {
    const errX = selfServer.x - next.x;
    const errZ = selfServer.z - next.z;
    const dist = Math.hypot(errX, errZ);
    const moving = moveInput.up || moveInput.down || moveInput.left || moveInput.right;

    if (dist > SNAP_THRESHOLD) {
      // 큰 디싱크: 즉시 권위 위치로 맞춘다.
      next.x = selfServer.x;
      next.z = selfServer.z;
    } else if (!moving && !selfServerMoving) {
      // 나도 멈췄고 서버도 정지 입력을 처리해 멈춘 뒤에만 잔여 오차를 정렬한다.
      // 서버가 아직 따라오는 중에 당기면 멈출 때 뒤로 끌렸다 오는 현상이 생긴다.
      const k = 1 - Math.exp(-RECONCILE_LAMBDA * dt);
      next.x += errX * k;
      next.z += errZ * k;
    }
  }

  selfPredicted = next;
  return next;
}

/**
 * 상대 캐릭터: INTERP_DELAY 만큼 과거 시점을 두 스냅샷 사이에서 보간.
 * 최신 데이터보다 앞선 시점이면 속도로 외삽(MAX_EXTRAP 한도).
 */
export function sampleRemote(id: string): MovementState | null {
  const buf = buffers.get(id);
  const first = buf?.[0];
  if (!buf || !first) {
    return null;
  }
  if (buf.length === 1) {
    return { x: first.x, z: first.z, rotation: first.rotation };
  }

  const renderTime = now() - INTERP_DELAY;

  for (let i = buf.length - 1; i > 0; i--) {
    const a = buf[i - 1];
    const b = buf[i];
    if (a && b && a.t <= renderTime && renderTime <= b.t) {
      const span = b.t - a.t || 1;
      const f = (renderTime - a.t) / span;
      return {
        x: a.x + (b.x - a.x) * f,
        z: a.z + (b.z - a.z) * f,
        rotation: lerpAngle(a.rotation, b.rotation, f)
      };
    }
  }

  const newest = buf[buf.length - 1];
  const prev = buf[buf.length - 2];
  if (newest && prev && renderTime > newest.t) {
    const span = newest.t - prev.t || 1;
    const ahead = Math.min(renderTime - newest.t, MAX_EXTRAP);
    const f = ahead / span;
    return {
      x: newest.x + (newest.x - prev.x) * f,
      z: newest.z + (newest.z - prev.z) * f,
      rotation: newest.rotation
    };
  }

  return { x: first.x, z: first.z, rotation: first.rotation };
}

function lerpAngle(a: number, b: number, f: number): number {
  let diff = (b - a) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * f;
}
