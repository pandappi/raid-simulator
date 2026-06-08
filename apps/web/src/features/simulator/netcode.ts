import { CLIENT_SIM_DT, stepMovement, type ClientInput, type MovementState } from "@raid-simulator/shared";

// 상대 플레이어를 과거 시점으로 렌더링해 부드러운 보간을 확보(ms).
// 서버 패치 간격(50ms)보다 약간 크게 잡아 보간을 보장하되 격차를 줄인다.
const INTERP_DELAY = 70;
// 스냅샷이 끊겼을 때 속도로 외삽할 수 있는 최대 시간(ms).
const MAX_EXTRAP = 120;
// 스냅샷 버퍼 보관 시간(ms).
const BUFFER_MS = 1000;
// 한 프레임에서 처리할 최대 시뮬레이션 스텝 수(탭 비활성 후 폭주 방지).
const MAX_STEPS_PER_FRAME = 5;

type Snap = { t: number; x: number; z: number; rotation: number };
type PendingInput = { seq: number; input: ClientInput };

const buffers = new Map<string, Snap[]>();
let selfId: string | null = null;

// 클라이언트 예측의 논리 상태(정확값). 렌더링은 이 값을 부드럽게 따라간다.
let selfPredicted: MovementState | null = null;
// 아직 서버가 처리하지 않은(미확인) 입력들. 재조정 시 재적용한다.
let pending: PendingInput[] = [];
let seqCounter = 0;
let accumulator = 0;
let wasMoving = false;

// 키보드에서 갱신하는 현재 보유 입력.
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
  pending = [];
  seqCounter = 0;
  accumulator = 0;
  wasMoving = false;
  selfId = null;
  moveInput.up = moveInput.down = moveInput.left = moveInput.right = false;
}

export function dropPlayer(id: string) {
  buffers.delete(id);
}

/**
 * 고정 스텝으로 예측을 진행하며 각 스텝마다 순번이 매겨진 입력 명령을 서버로 보낸다.
 * - 이동 중에는 매 스텝 명령을 전송(서버가 동일 dt로 재현 → 결정론적 일치).
 * - 정지하면 "정지" 명령 한 번만 보내고 유휴 트래픽은 생성하지 않는다.
 * frameDt: 직전 프레임과의 시간 간격(초). send: 서버로 명령을 보내는 콜백.
 */
export function advance(frameDt: number, cameraYaw: number, send: (input: ClientInput) => void) {
  if (!selfPredicted) {
    return;
  }

  const moving = moveInput.up || moveInput.down || moveInput.left || moveInput.right;
  if (!moving && !wasMoving) {
    // 완전 유휴: 누적 시간을 비워 재개 시 폭주를 막는다.
    accumulator = 0;
    return;
  }

  accumulator += Math.min(frameDt, MAX_STEPS_PER_FRAME * CLIENT_SIM_DT);

  let steps = 0;
  while (accumulator >= CLIENT_SIM_DT && steps < MAX_STEPS_PER_FRAME) {
    const command: ClientInput = {
      up: moveInput.up,
      down: moveInput.down,
      left: moveInput.left,
      right: moveInput.right,
      cameraYaw,
      seq: ++seqCounter,
      dt: CLIENT_SIM_DT
    };

    selfPredicted = stepMovement(selfPredicted, command, CLIENT_SIM_DT);
    pending.push({ seq: command.seq as number, input: command });
    send(command);

    accumulator -= CLIENT_SIM_DT;
    steps += 1;
  }

  // 폭주 방지로 남은 누적 시간은 버린다.
  if (steps >= MAX_STEPS_PER_FRAME) {
    accumulator = 0;
  }

  wasMoving = moving;
}

/** 자기 캐릭터의 현재 예측 위치(렌더링용). */
export function getSelfState(): MovementState | null {
  return selfPredicted;
}

/**
 * 서버 권위 스냅샷을 버퍼에 적재한다.
 * 자기 자신이면 Gambetta 방식으로 재조정: 권위 위치로 맞춘 뒤
 * 서버가 아직 처리하지 않은(미확인) 입력만 다시 적용한다 → 롤백 없음.
 */
export function ingestSnapshot(id: string, x: number, z: number, rotation: number, lastSeq = 0) {
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
    if (!selfPredicted) {
      selfPredicted = { x, z, rotation };
      return;
    }

    // 1) 권위 상태에서 시작
    let reconciled: MovementState = { x, z, rotation };
    // 2) 서버가 이미 처리한 입력은 버린다
    pending = pending.filter((entry) => entry.seq > lastSeq);
    // 3) 미확인 입력을 순서대로 재적용해 '현재' 예측 위치를 복원
    for (const entry of pending) {
      reconciled = stepMovement(reconciled, entry.input, entry.input.dt ?? CLIENT_SIM_DT);
    }
    selfPredicted = reconciled;
  }
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
