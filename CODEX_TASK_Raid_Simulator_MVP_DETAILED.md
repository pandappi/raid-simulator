# CODEX TASK: 8인 멀티 2.5D 레이드 시뮬레이터 MVP

## 0. 문서 목적

이 문서는 Codex에게 전달할 개발 명세서다.

목표는 **FFXIV Raid Simulator와 유사한 8인 멀티플레이 2.5D 레이드 시뮬레이션 공간의 0차 MVP**를 구현하는 것이다.

이번 단계에서는 레이드 기믹, 장판 판정, DB, 로그인, 공개 방 목록, 배포 자동화까지 구현하지 않는다. 0차 MVP의 핵심은 다음이다.

```txt
8명의 사용자가 같은 Room에 접속한다.
각 사용자는 역할을 하나 선택한다.
각 사용자는 WASD로 원통 캐릭터를 이동한다.
다른 사용자의 위치가 실시간으로 보인다.
마우스 우클릭 드래그로 카메라를 회전한다.
마우스 휠로 줌인/줌아웃한다.
```

즉, 이번 작업은 **레이드 기믹 시뮬레이터 본체를 만들기 전, 8인 동기화 가능한 2.5D 레이드 공간을 만드는 단계**다.

---

## 1. 최종 목표와 현재 MVP 범위

### 1.1 최종 목표

최종적으로는 여러 사용자가 웹에서 접속해 레이드 기믹을 연습할 수 있는 공개형 웹 시뮬레이터를 목표로 한다.

장기 목표 예시:

```txt
- 8인 Room 생성
- 링크 공유 기반 입장
- 역할 선택
- 방장 Start
- 서버 기준 기믹 타임라인 재생
- 장판 / 쉐어 / 산개 / 타워 / 넉백 판정
- 기믹 JSON 데이터 관리
- 공개 기믹 목록
- 처리법 공유
- 관전자 모드
- 피드백 / 신고 / 모니터링
```

### 1.2 이번 MVP 목표

이번 MVP에서는 위 장기 목표 중 **멀티 접속 공간과 기본 이동 동기화**만 구현한다.

구현할 것:

```txt
- Monorepo 구성
- Next.js 웹 클라이언트
- Colyseus 실시간 서버
- shared package를 통한 공통 타입 공유
- 8인 Room
- 역할 선택
- 역할 중복 방지
- 2.5D 원형 아레나
- 원통 플레이어 표시
- 역할 라벨 표시
- WASD 이동
- 서버 기준 위치 상태 관리
- 다른 사용자 위치 실시간 동기화
- 우클릭 카메라 회전
- 휠 줌인/줌아웃
- 접속 종료 시 플레이어 제거
```

구현하지 않을 것:

```txt
- FFXIV 공식 에셋 사용
- 공식 캐릭터/보스 모델
- 공식 아이콘/사운드/음악
- 실제 레이드 기믹
- 장판 데미지 판정
- HP / 데미지 / 힐
- 스킬 사용
- 애니메이션
- 로그인
- 회원가입
- DB 저장
- Redis
- 배포 설정
- 방 목록
- 공개 매칭
- 관전자 모드
- 채팅
- 음성 채팅
- 리플레이
```

---

## 2. 주요 개념 정리

### 2.1 2.5D 정의

이번 프로젝트에서 2.5D는 다음을 의미한다.

```txt
렌더링은 3D 공간에서 한다.
하지만 게임 로직은 x/z 평면 좌표 중심으로 처리한다.
y축 높이는 거의 고정한다.
플레이어는 점프하지 않는다.
지형 높낮이는 없다.
장판/기믹 판정은 x/z 평면 거리 계산을 기준으로 확장할 예정이다.
```

좌표 예시:

```ts
type Position = {
  x: number;
  z: number;
};
```

Three.js/R3F 렌더링에서는 실제 위치를 `[x, y, z]`로 사용하되, `y`는 고정값으로 둔다.

```ts
const cylinderPosition = [player.x, CYLINDER_HEIGHT / 2, player.z];
```

### 2.2 멀티플레이 방향

이번 MVP는 처음부터 멀티를 전제로 한다.

```txt
클라이언트는 입력을 보낸다.
서버는 위치를 계산한다.
서버는 Room 상태를 모든 클라이언트에 동기화한다.
클라이언트는 서버 상태를 렌더링한다.
```

나쁜 방향:

```txt
클라이언트가 자기 위치를 직접 확정하고 서버에 좌표만 전송한다.
```

이번 MVP에서 채택할 방향:

```txt
클라이언트는 key input 상태만 보낸다.
서버는 input 상태를 기반으로 위치를 계산한다.
```

이유:

```txt
- 나중에 장판 판정, 산개 판정, 타워 판정을 서버 기준으로 처리하기 쉽다.
- 유저마다 다른 결과가 나오는 문제를 줄일 수 있다.
- 멀티 시뮬레이터의 기반 구조가 더 명확해진다.
```

---

## 3. 기술 스택

### 3.1 Monorepo

패키지 매니저는 `pnpm`을 사용한다.

권장 구조:

```txt
raid-practice-sim/
  apps/
    web/
    server/
  packages/
    shared/
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  README.md
```

### 3.2 apps/web

프론트엔드 앱.

사용 기술:

```txt
- Next.js
- React
- TypeScript
- React Three Fiber
- @react-three/drei
- zustand
- colyseus.js client
```

역할:

```txt
- 이름 입력 UI
- 역할 선택 UI
- Room 접속
- 서버 상태 구독
- 2.5D Scene 렌더링
- WASD 입력 수집
- 카메라 조작
- 연결 상태 표시
```

### 3.3 apps/server

실시간 게임 서버.

사용 기술:

```txt
- Node.js
- TypeScript
- Colyseus
```

역할:

```txt
- Room 생성
- 최대 8명 제한
- 역할 중복 방지
- 연결/퇴장 처리
- 클라이언트 입력 수신
- 서버 tick 기반 위치 계산
- Room State 동기화
```

### 3.4 packages/shared

프론트와 서버가 공유하는 타입과 상수를 둔다.

역할:

```txt
- PlayerRole 타입
- PlayerState 타입
- ClientInput 타입
- 좌표 타입
- 역할 목록 상수
- 이동 관련 상수
- 아레나 관련 상수
```

---

## 4. 로컬 개발 실행 목표

최종적으로 다음 명령이 동작해야 한다.

```bash
pnpm install
pnpm dev
```

또는 분리 실행도 가능해야 한다.

```bash
pnpm dev:web
pnpm dev:server
```

권장 로컬 포트:

```txt
web:    http://localhost:3000
server: ws://localhost:2567
```

웹 클라이언트 환경변수:

```env
NEXT_PUBLIC_GAME_SERVER_URL=ws://localhost:2567
```

---

## 5. Package Scripts 요구사항

루트 `package.json`에 최소한 다음 스크립트를 제공한다.

```json
{
  "scripts": {
    "dev": "pnpm -r --parallel dev",
    "dev:web": "pnpm --filter web dev",
    "dev:server": "pnpm --filter server dev",
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck"
  }
}
```

세부 구현은 실제 패키지 이름에 맞게 조정해도 된다.

---

## 6. Shared 타입 명세

`packages/shared/src` 아래에 공통 타입을 작성한다.

### 6.1 PlayerRole

```ts
export const PLAYER_ROLES = [
  'MT',
  'ST',
  'H1',
  'H2',
  'D1',
  'D2',
  'D3',
  'D4',
] as const;

export type PlayerRole = (typeof PLAYER_ROLES)[number];
```

### 6.2 Vector2Like

```ts
export type Vector2Like = {
  x: number;
  z: number;
};
```

### 6.3 ClientInput

```ts
export type ClientInput = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
};
```

### 6.4 PlayerSnapshot

서버 상태를 클라이언트가 렌더링할 때 사용하는 형태.

```ts
export type PlayerSnapshot = {
  id: string;
  name: string;
  role: PlayerRole;
  x: number;
  z: number;
  rotation: number;
};
```

### 6.5 RoomPhase

이번 MVP에서는 `waiting`과 `playing` 정도만 있어도 된다.

```ts
export type RoomPhase = 'waiting' | 'playing';
```

### 6.6 Constants

```ts
export const MAX_PLAYERS = 8;
export const ARENA_RADIUS = 20;
export const PLAYER_MOVE_SPEED = 8;
export const SERVER_TICK_RATE = 20;
export const SERVER_TICK_MS = 1000 / SERVER_TICK_RATE;
```

`PLAYER_MOVE_SPEED`는 초당 이동 거리 기준이다.

---

## 7. Colyseus 서버 명세

### 7.1 Room 이름

Room 클래스 이름:

```ts
RaidRoom
```

Room 등록 이름:

```ts
'raid_room'
```

클라이언트는 `joinOrCreate('raid_room', options)`로 입장한다.

### 7.2 Room 입장 옵션

클라이언트가 Room에 들어갈 때 전달하는 옵션:

```ts
type JoinOptions = {
  name: string;
  role: PlayerRole;
};
```

검증 조건:

```txt
- name은 비어 있으면 안 된다.
- name은 너무 길면 안 된다. 예: 20자 제한.
- role은 PLAYER_ROLES 중 하나여야 한다.
- Room 인원이 8명 미만이어야 한다.
- 이미 선택된 role은 선택할 수 없다.
```

검증 실패 시 입장을 거부한다.

### 7.3 Room State

Colyseus Schema를 사용한다.

개념적으로 필요한 상태:

```txt
phase
players
```

Colyseus Schema 예시 방향:

```ts
class PlayerSchema extends Schema {
  @type('string') id = '';
  @type('string') name = '';
  @type('string') role = '';
  @type('number') x = 0;
  @type('number') z = 0;
  @type('number') rotation = 0;
}

class RaidRoomState extends Schema {
  @type('string') phase = 'waiting';
  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
}
```

`role`은 Colyseus Schema에서는 string으로 저장해도 된다. 단, shared 타입에서 검증한다.

### 7.4 서버 내부 상태

Schema 외에 서버 내부에서만 관리할 입력 상태가 필요하다.

```ts
type InputMap = Map<string, ClientInput>;
```

기본 입력 상태:

```ts
const EMPTY_INPUT: ClientInput = {
  up: false,
  down: false,
  left: false,
  right: false,
};
```

### 7.5 onCreate

Room 생성 시 수행할 것:

```txt
- maxClients = 8 설정
- 초기 state 설정
- 'input' 메시지 핸들러 등록
- simulation interval 설정
```

서버 tick:

```txt
20fps, 약 50ms마다 update
```

### 7.6 onJoin

플레이어 입장 시 수행할 것:

```txt
1. join options 검증
2. 역할 중복 확인
3. 초기 위치 계산
4. PlayerSchema 생성
5. state.players에 추가
6. input map에 EMPTY_INPUT 추가
```

초기 위치는 역할별 기본 위치를 사용한다.

예시:

```ts
const ROLE_INITIAL_POSITIONS: Record<PlayerRole, { x: number; z: number }> = {
  MT: { x: 0, z: -8 },
  ST: { x: 2, z: -8 },
  H1: { x: -8, z: 0 },
  H2: { x: 8, z: 0 },
  D1: { x: -4, z: 6 },
  D2: { x: 4, z: 6 },
  D3: { x: -8, z: 6 },
  D4: { x: 8, z: 6 },
};
```

### 7.7 onLeave

플레이어 퇴장 시 수행할 것:

```txt
- state.players에서 sessionId 제거
- input map에서 sessionId 제거
- 해당 role은 자연스럽게 다시 선택 가능해야 한다.
```

역할 중복 확인은 `state.players`에 남아 있는 플레이어 role을 기준으로 계산한다.

### 7.8 input 메시지

클라이언트는 다음 메시지를 서버로 보낸다.

```ts
room.send('input', {
  up: boolean,
  down: boolean,
  left: boolean,
  right: boolean,
});
```

서버 검증:

```txt
- 메시지 payload가 object인지 확인
- up/down/left/right가 boolean인지 확인
- 잘못된 입력이면 무시
```

### 7.9 위치 계산

서버 tick마다 다음을 수행한다.

```txt
1. 각 플레이어의 input 상태를 가져온다.
2. input을 direction vector로 변환한다.
3. 대각선 이동이 더 빨라지지 않도록 normalize한다.
4. deltaTime을 반영해 x/z를 갱신한다.
5. 아레나 밖으로 너무 멀리 나가지 않게 clamp한다.
6. 이동 방향을 rotation으로 반영한다.
```

이동 방향:

```txt
W/up    = z 감소
S/down  = z 증가
A/left  = x 감소
D/right = x 증가
```

대각선 normalization 예시:

```ts
let dx = 0;
let dz = 0;

if (input.up) dz -= 1;
if (input.down) dz += 1;
if (input.left) dx -= 1;
if (input.right) dx += 1;

const length = Math.hypot(dx, dz);
if (length > 0) {
  dx /= length;
  dz /= length;
}
```

이동량:

```ts
player.x += dx * PLAYER_MOVE_SPEED * deltaSeconds;
player.z += dz * PLAYER_MOVE_SPEED * deltaSeconds;
```

아레나 제한:

```txt
ARENA_RADIUS보다 약간 안쪽으로 제한한다.
예: movementRadius = ARENA_RADIUS - 0.8
```

원형 clamp 예시:

```ts
const distance = Math.hypot(player.x, player.z);
if (distance > movementRadius) {
  const ratio = movementRadius / distance;
  player.x *= ratio;
  player.z *= ratio;
}
```

rotation:

```ts
if (length > 0) {
  player.rotation = Math.atan2(dx, dz);
}
```

rotation의 정확한 방향은 렌더링에서 보기에 자연스럽게 조정해도 된다.

---

## 8. 프론트엔드 화면 명세

### 8.1 페이지 구성

간단한 MVP 기준으로 다음 중 하나를 선택한다.

#### 선택 A: 단일 페이지

```txt
/
  - 이름 입력
  - 역할 선택
  - Join 버튼
  - 접속 후 같은 페이지에서 Canvas 표시
```

#### 선택 B: 분리 페이지

```txt
/
  - 이름 입력
  - 역할 선택
  - Join 버튼

/sim
  - Canvas
  - 접속 상태
```

MVP에서는 선택 A가 더 단순하다. Codex는 구현 편의상 선택 A로 진행해도 된다.

### 8.2 초기 화면

요구사항:

```txt
- 제목 표시
- 이름 입력 input
- 역할 선택 버튼 8개
- Join 버튼
- 서버 연결 실패 시 에러 메시지
```

역할 버튼:

```txt
MT ST H1 H2 D1 D2 D3 D4
```

이번 MVP에서는 입장 전에는 이미 선택된 역할을 알기 어렵다. 따라서 입장 시 서버가 중복을 거부하면 에러 메시지를 보여준다.

추가 개선으로 Room에 입장하기 전에 역할 점유 상태를 가져오는 기능은 이번 MVP에서는 제외한다.

### 8.3 시뮬레이터 화면

요구사항:

```txt
- 전체 화면 또는 넓은 영역에 Canvas 표시
- 좌상단에 내 이름 / 역할 / 접속 상태 표시
- 현재 Room의 플레이어 수 표시
- 조작법 표시
  - WASD: 이동
  - Right Drag: 카메라 회전
  - Wheel: 줌
- Leave 버튼 또는 새로고침/닫기로 퇴장 가능
```

---

## 9. React Three Fiber Scene 명세

### 9.1 컴포넌트 구조

권장 구조:

```txt
apps/web/src/features/simulator/
  components/
    SimulatorCanvas.tsx
    SimulatorScene.tsx
    Arena.tsx
    PlayerCylinder.tsx
    PlayerLabel.tsx
    CameraControls.tsx
    ConnectionOverlay.tsx
    JoinPanel.tsx
  hooks/
    useKeyboardInput.ts
    useRaidRoom.ts
  stores/
    simulatorStore.ts
  utils/
    playerColor.ts
```

### 9.2 SimulatorCanvas

역할:

```txt
- Canvas 생성
- onContextMenu preventDefault 적용
- Scene 렌더링
```

우클릭 메뉴 방지:

```tsx
<div onContextMenu={(event) => event.preventDefault()}>
  <Canvas>
    <SimulatorScene />
  </Canvas>
</div>
```

### 9.3 SimulatorScene

렌더링 요소:

```txt
- ambientLight
- directionalLight
- grid helper 또는 커스텀 grid
- Arena
- PlayerCylinder 목록
- CameraControls
```

카메라 기본값:

```txt
position: [0, 24, 24]
fov: 45 ~ 60
```

### 9.4 Arena

원형 아레나 요구사항:

```txt
- 평평한 원형 바닥
- 반지름 ARENA_RADIUS
- 중앙은 (0, 0)
- 색상은 임시 기본값 사용
- 공식 FFXIV 맵 에셋 사용 금지
```

구현 방법 예시:

```txt
- CircleGeometry를 x/z 평면에 눕혀서 사용
- 또는 CylinderGeometry를 낮은 높이로 사용
```

권장:

```tsx
<mesh rotation={[-Math.PI / 2, 0, 0]}>
  <circleGeometry args={[ARENA_RADIUS, 96]} />
  <meshStandardMaterial />
</mesh>
```

아레나 경계선:

```txt
- ring 형태 또는 line으로 표시하면 좋다.
- MVP에서는 단순 표시여도 된다.
```

### 9.5 PlayerCylinder

요구사항:

```txt
- 원통 geometry 사용
- 위치는 player.x, player.z 기반
- y는 원통 높이에 맞게 고정
- 원통 위에 role label 표시
- 내 플레이어와 타 플레이어가 구분되면 좋다.
```

크기 예시:

```txt
radius: 0.45
height: 1.4
```

위치 예시:

```tsx
<mesh position={[player.x, PLAYER_HEIGHT / 2, player.z]}>
  <cylinderGeometry args={[0.45, 0.45, PLAYER_HEIGHT, 24]} />
  <meshStandardMaterial />
</mesh>
```

### 9.6 PlayerLabel

`@react-three/drei`의 `Text` 또는 `Html`을 사용한다.

요구사항:

```txt
- 원통 위에 역할 표시
- 카메라 방향과 무관하게 읽기 쉬워야 한다.
- MVP에서는 Html을 사용해도 된다.
```

예시:

```tsx
<Html position={[player.x, 2.0, player.z]} center>
  <div>{player.role}</div>
</Html>
```

### 9.7 CameraControls

`@react-three/drei`의 `OrbitControls`를 사용한다.

요구사항:

```txt
- 우클릭 드래그로 회전
- 휠 줌
- pan 비활성화
- 카메라가 바닥 아래로 내려가지 않도록 polar angle 제한
- 너무 가까이/멀리 가지 않도록 distance 제한
```

권장 설정 방향:

```tsx
<OrbitControls
  enablePan={false}
  enableZoom={true}
  enableRotate={true}
  mouseButtons={{
    LEFT: undefined,
    MIDDLE: undefined,
    RIGHT: MOUSE.ROTATE,
  }}
  minDistance={8}
  maxDistance={45}
  minPolarAngle={Math.PI / 6}
  maxPolarAngle={Math.PI / 2.3}
/>
```

주의:

```txt
three의 MOUSE import가 필요할 수 있다.
브라우저 우클릭 메뉴는 Canvas wrapper에서 preventDefault한다.
```

---

## 10. 클라이언트 상태관리 명세

### 10.1 zustand store

`simulatorStore.ts`에 최소 상태를 둔다.

예시:

```ts
type SimulatorState = {
  sessionId: string | null;
  players: Record<string, PlayerSnapshot>;
  selfRole: PlayerRole | null;
  selfName: string;
  connectionStatus: 'idle' | 'connecting' | 'connected' | 'error' | 'disconnected';
  errorMessage: string | null;
};
```

액션 예시:

```ts
type SimulatorActions = {
  setSessionId: (sessionId: string | null) => void;
  setPlayers: (players: Record<string, PlayerSnapshot>) => void;
  setConnectionStatus: (status: SimulatorState['connectionStatus']) => void;
  setErrorMessage: (message: string | null) => void;
  reset: () => void;
};
```

### 10.2 Room state 반영

Colyseus Room state에서 players가 변경되면 zustand store에 반영한다.

구현 방식은 Colyseus client API에 맞춰 조정한다.

목표:

```txt
서버의 state.players가 바뀌면 React 화면의 PlayerCylinder 목록이 갱신된다.
```

---

## 11. useRaidRoom 훅 명세

### 11.1 책임

`useRaidRoom`은 네트워크 연결만 담당한다.

담당할 것:

```txt
- Colyseus Client 생성
- Room joinOrCreate
- join options 전달
- Room state 구독
- sessionId 저장
- input 메시지 전송 함수 제공
- leave 처리
- error 처리
```

담당하지 않을 것:

```txt
- 3D 렌더링
- 키보드 이벤트 직접 처리
- 플레이어 위치 계산
```

### 11.2 API 예시

```ts
type JoinParams = {
  name: string;
  role: PlayerRole;
};

export function useRaidRoom() {
  return {
    join,
    leave,
    sendInput,
    isConnected,
  };
}
```

### 11.3 서버 URL

환경변수에서 읽는다.

```ts
const serverUrl = process.env.NEXT_PUBLIC_GAME_SERVER_URL;
```

없을 경우 기본값:

```ts
'ws://localhost:2567'
```

---

## 12. useKeyboardInput 훅 명세

### 12.1 책임

`useKeyboardInput`은 WASD 키 입력을 감지하고 현재 input 상태를 서버로 보낸다.

요구사항:

```txt
- keydown / keyup 이벤트 등록
- W/A/S/D 입력 상태 관리
- input, textarea, select에 포커스 중이면 이동 입력 무시 가능
- unmount 시 이벤트 제거
- 일정 interval 또는 requestAnimationFrame으로 input 상태 전송
```

### 12.2 입력 매핑

```txt
W / ArrowUp    -> up
S / ArrowDown  -> down
A / ArrowLeft  -> left
D / ArrowRight -> right
```

화살표 키 지원은 선택사항이지만 구현해도 좋다.

### 12.3 전송 주기

권장:

```txt
20fps 기준, 약 50ms마다 현재 input 상태 전송
```

또는 입력 변경 시에만 보내도 된다. 단, keyup 누락이나 네트워크 이슈를 줄이기 위해 일정 interval 전송이 더 단순하다.

---

## 13. 네트워크 메시지 프로토콜

### 13.1 join

클라이언트 -> 서버:

```ts
client.joinOrCreate('raid_room', {
  name,
  role,
});
```

### 13.2 input

클라이언트 -> 서버:

```ts
room.send('input', {
  up: boolean,
  down: boolean,
  left: boolean,
  right: boolean,
});
```

### 13.3 state sync

서버 -> 클라이언트:

Colyseus Schema state sync를 사용한다.

별도 broadcast 메시지로 players를 수동 전송하지 않는다. 필요한 경우 디버깅 메시지만 추가한다.

---

## 14. 역할 선택 정책

### 14.1 역할 목록

```txt
MT
ST
H1
H2
D1
D2
D3
D4
```

### 14.2 중복 방지

서버에서 반드시 검증한다.

검증 방식:

```txt
Room state의 players를 순회해서 이미 같은 role이 있는지 확인한다.
```

이미 선택된 role이면 join을 거부한다.

클라이언트는 에러 메시지를 보여준다.

예시 메시지:

```txt
이미 선택된 역할입니다. 다른 역할을 선택해주세요.
```

### 14.3 정원 초과

Room에 8명이 있으면 join을 거부한다.

예시 메시지:

```txt
방이 가득 찼습니다.
```

---

## 15. 이동 정책

### 15.1 이동 방식

이번 MVP에서는 **맵 기준 이동**만 구현한다.

```txt
W = 맵 북쪽 / z 감소
S = 맵 남쪽 / z 증가
A = 맵 서쪽 / x 감소
D = 맵 동쪽 / x 증가
```

카메라 기준 이동은 구현하지 않는다.

이유:

```txt
- 구현이 단순하다.
- 레이드 위치 연습에서는 맵 기준 방향이 더 명확할 수 있다.
- 추후 옵션으로 카메라 기준 이동을 추가할 수 있다.
```

### 15.2 이동 속도

`PLAYER_MOVE_SPEED` 상수를 사용한다.

```ts
export const PLAYER_MOVE_SPEED = 8;
```

초당 8 units 이동을 의미한다.

### 15.3 대각선 이동 보정

W+D를 동시에 눌렀을 때 더 빠르게 이동하면 안 된다.

반드시 direction vector를 normalize한다.

### 15.4 아레나 경계 제한

플레이어가 아레나 밖으로 나가지 않도록 한다.

```ts
const MOVEMENT_RADIUS = ARENA_RADIUS - 0.8;
```

플레이어 좌표가 이 반지름 밖으로 나가면 원형 boundary 안으로 clamp한다.

---

## 16. 접속/퇴장 처리

### 16.1 브라우저 종료

브라우저 탭을 닫거나 새로고침하면 Colyseus onLeave가 호출되어야 한다.

서버는 해당 player를 제거한다.

다른 클라이언트 화면에서도 해당 원통이 사라져야 한다.

### 16.2 Leave 버튼

MVP에서 선택사항이지만 가능하면 구현한다.

Leave 버튼 동작:

```txt
- room.leave() 호출
- store reset
- Join 화면으로 복귀
```

---

## 17. 오류 처리

### 17.1 클라이언트 오류 메시지

최소한 다음 오류를 사용자에게 보여준다.

```txt
- 서버에 연결할 수 없습니다.
- 방이 가득 찼습니다.
- 이미 선택된 역할입니다.
- 이름을 입력해주세요.
- 역할을 선택해주세요.
```

### 17.2 서버 방어 코드

서버는 잘못된 메시지를 받아도 죽지 않아야 한다.

예시:

```txt
- input payload가 null인 경우 무시
- input 필드 타입이 boolean이 아니면 무시
- 없는 sessionId의 input이면 무시
```

---

## 18. 스타일/UI 요구사항

이번 MVP에서는 디자인 완성도가 중요하지 않다.

단, 최소한 다음은 확인 가능해야 한다.

```txt
- 어떤 역할로 접속했는지 보인다.
- 현재 몇 명이 접속했는지 보인다.
- 각 원통 위에 역할이 보인다.
- 내 캐릭터와 다른 캐릭터가 구분된다.
- 조작법이 보인다.
```

색상은 임시값을 사용해도 된다.

역할별 색상은 선택사항이다.

---

## 19. 추천 파일 구조 상세

### 19.1 루트

```txt
raid-practice-sim/
  apps/
    web/
    server/
  packages/
    shared/
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  README.md
```

### 19.2 packages/shared

```txt
packages/shared/
  src/
    constants.ts
    roles.ts
    types.ts
    index.ts
  package.json
  tsconfig.json
```

### 19.3 apps/server

```txt
apps/server/
  src/
    index.ts
    rooms/
      RaidRoom.ts
    schemas/
      PlayerSchema.ts
      RaidRoomState.ts
    utils/
      validateJoinOptions.ts
      movement.ts
  package.json
  tsconfig.json
```

### 19.4 apps/web

```txt
apps/web/
  src/
    app/
      page.tsx
      layout.tsx
      globals.css
    features/
      simulator/
        components/
          JoinPanel.tsx
          SimulatorCanvas.tsx
          SimulatorScene.tsx
          Arena.tsx
          PlayerCylinder.tsx
          PlayerLabel.tsx
          CameraControls.tsx
          ConnectionOverlay.tsx
        hooks/
          useRaidRoom.ts
          useKeyboardInput.ts
        stores/
          simulatorStore.ts
        utils/
          playerColor.ts
  package.json
  tsconfig.json
  next.config.ts
```

Next.js app router 사용을 권장한다.

---

## 20. 서버 구현 세부 지시

### 20.1 index.ts

요구사항:

```txt
- Colyseus Server 생성
- raid_room 등록
- 포트 2567에서 listen
- CORS는 로컬 web app에서 접속 가능하게 설정
```

### 20.2 RaidRoom.ts

요구사항:

```txt
- maxClients = MAX_PLAYERS
- onCreate에서 state 초기화
- onCreate에서 input handler 등록
- setSimulationInterval 또는 setInterval로 tick 실행
- onJoin에서 join options 검증 및 player 추가
- onLeave에서 player 제거
```

### 20.3 movement.ts

서버 위치 계산 로직은 별도 util로 분리한다.

예시 책임:

```txt
- input -> direction 변환
- normalize
- position update
- arena clamp
- rotation 계산
```

이렇게 분리하면 나중에 기믹 판정 로직과 함께 재사용하기 쉽다.

---

## 21. 클라이언트 구현 세부 지시

### 21.1 JoinPanel.tsx

요구사항:

```txt
- 이름 input
- 역할 버튼 목록
- 선택된 역할 표시
- Join 버튼
- 로딩 상태 표시
- 에러 메시지 표시
```

Join 클릭 시:

```txt
1. name 검증
2. role 검증
3. useRaidRoom.join({ name, role }) 호출
```

### 21.2 SimulatorCanvas.tsx

요구사항:

```txt
- Canvas wrapper
- 우클릭 메뉴 방지
- Canvas 높이 확보
- SimulatorScene 렌더링
```

### 21.3 SimulatorScene.tsx

요구사항:

```txt
- zustand store에서 players 조회
- players를 PlayerCylinder 목록으로 렌더링
- self sessionId를 기준으로 내 플레이어 여부 전달
```

### 21.4 PlayerCylinder.tsx

Props 예시:

```ts
type PlayerCylinderProps = {
  player: PlayerSnapshot;
  isSelf: boolean;
};
```

요구사항:

```txt
- 원통 표시
- 역할 라벨 표시
- isSelf면 시각적으로 구분
```

### 21.5 useKeyboardInput.ts

Props 예시:

```ts
type UseKeyboardInputParams = {
  enabled: boolean;
  sendInput: (input: ClientInput) => void;
};
```

요구사항:

```txt
- enabled가 true일 때만 입력 전송
- interval 정리
- event listener 정리
```

---

## 22. 개발 순서

Codex는 아래 순서대로 작업한다.

### Step 1. Monorepo 구성

```txt
- pnpm workspace 설정
- apps/web 생성
- apps/server 생성
- packages/shared 생성
- TypeScript 빌드 설정
```

완료 기준:

```txt
pnpm install 가능
pnpm typecheck가 최소한 실행 가능
```

### Step 2. shared 타입 작성

```txt
- PLAYER_ROLES
- PlayerRole
- Vector2Like
- ClientInput
- PlayerSnapshot
- constants
```

완료 기준:

```txt
web/server에서 shared 타입 import 가능
```

### Step 3. Colyseus 서버 구현

```txt
- Colyseus 서버 실행
- RaidRoom 등록
- Room state schema 작성
- join/leave 처리
- input 처리
- tick 기반 위치 계산
```

완료 기준:

```txt
pnpm dev:server 실행 시 ws://localhost:2567 서버가 뜬다.
```

### Step 4. Next.js 클라이언트 구현

```txt
- JoinPanel
- useRaidRoom
- zustand store
- 서버 연결
```

완료 기준:

```txt
브라우저에서 이름/역할 입력 후 Room에 입장할 수 있다.
```

### Step 5. 2.5D Scene 구현

```txt
- Canvas
- Arena
- PlayerCylinder
- PlayerLabel
- CameraControls
```

완료 기준:

```txt
Room에 들어온 플레이어가 원통으로 보인다.
```

### Step 6. WASD 이동 동기화

```txt
- useKeyboardInput
- input 메시지 전송
- 서버 위치 계산
- 클라이언트 위치 반영
```

완료 기준:

```txt
브라우저 2개에서 같은 Room에 접속했을 때, 한쪽 이동이 다른 쪽에 보인다.
```

### Step 7. 품질 보완

```txt
- 역할 중복 에러 표시
- 정원 초과 에러 표시
- 연결 실패 표시
- Leave 처리
- README 작성
```

완료 기준:

```txt
로컬 테스트 방법이 README에 정리되어 있다.
```

---

## 23. 수동 테스트 시나리오

### 23.1 기본 실행

```bash
pnpm install
pnpm dev
```

확인:

```txt
- web이 localhost:3000에서 열린다.
- server가 localhost:2567에서 열린다.
```

### 23.2 2인 접속 테스트

절차:

```txt
1. 브라우저 탭 A를 연다.
2. 이름 Alice, 역할 MT로 입장한다.
3. 브라우저 탭 B를 연다.
4. 이름 Bob, 역할 ST로 입장한다.
5. 탭 A에서 WASD로 이동한다.
6. 탭 B에서 MT 원통이 움직이는지 확인한다.
7. 탭 B에서 WASD로 이동한다.
8. 탭 A에서 ST 원통이 움직이는지 확인한다.
```

성공 기준:

```txt
양쪽 화면 모두 두 명의 원통이 보이고 위치가 동기화된다.
```

### 23.3 역할 중복 테스트

절차:

```txt
1. 탭 A에서 MT로 입장한다.
2. 탭 B에서 MT로 입장 시도한다.
```

성공 기준:

```txt
탭 B는 입장 실패하고 에러 메시지가 보인다.
```

### 23.4 퇴장 테스트

절차:

```txt
1. 탭 A와 탭 B를 같은 Room에 접속한다.
2. 탭 B를 닫는다.
```

성공 기준:

```txt
탭 A에서 탭 B의 원통이 사라진다.
```

### 23.5 8인 제한 테스트

절차:

```txt
1. 브라우저 탭 8개를 열어 서로 다른 역할로 입장한다.
2. 9번째 탭에서 입장 시도한다.
```

성공 기준:

```txt
9번째 사용자는 입장할 수 없다.
```

### 23.6 카메라 테스트

절차:

```txt
1. 시뮬레이터 화면에서 마우스 우클릭 드래그를 한다.
2. 마우스 휠을 움직인다.
3. 우클릭 메뉴가 뜨는지 확인한다.
```

성공 기준:

```txt
- 우클릭 드래그로 카메라 회전 가능
- 휠로 줌 가능
- 브라우저 우클릭 메뉴가 뜨지 않음
- 카메라가 바닥 아래로 들어가지 않음
```

---

## 24. 완료 후 Codex가 보고해야 할 내용

구현이 끝나면 다음을 정리한다.

```txt
1. 실행 방법
2. 폴더 구조
3. 주요 파일 설명
4. 구현된 기능 목록
5. 구현하지 않은 기능 목록
6. 로컬 테스트 방법
7. 알려진 제한사항
8. 다음 단계 제안
```

---

## 25. 금지사항

다음은 이번 MVP에서 하지 않는다.

```txt
- FFXIV 공식 에셋 사용 금지
- 공식 명칭/아이콘/사운드/음악 포함 금지
- DB 추가 금지
- 로그인 추가 금지
- Redis 추가 금지
- Docker 필수화 금지
- AWS/EC2/Kubernetes 설정 금지
- 레이드 기믹 구현 금지
- 기믹 타임라인 구현 금지
- 채팅 구현 금지
- 음성 채팅 구현 금지
```

공식 에셋 대신 추상화된 도형만 사용한다.

---

## 26. 확장성을 위한 설계 원칙

이번 MVP는 작게 만들지만, 나중에 기믹을 붙일 수 있어야 한다.

따라서 다음 책임을 분리한다.

```txt
렌더링
입력 처리
네트워크 통신
서버 상태 관리
공통 타입
위치 계산
```

피해야 할 구조:

```txt
SimulatorScene 컴포넌트 하나에서
- 서버 연결
- 키보드 입력
- 위치 계산
- 원통 렌더링
- 상태 관리
을 모두 처리하는 구조
```

권장 구조:

```txt
SimulatorScene:
- 렌더링만 담당

useKeyboardInput:
- 입력 수집 담당

useRaidRoom:
- 서버 연결 담당

Colyseus RaidRoom:
- 서버 상태와 위치 계산 담당

shared:
- 공통 타입과 상수 담당
```

---

## 27. 향후 Phase 계획

이번 MVP 이후 단계는 다음과 같다.

### Phase 1. 단순 AoE 기믹

```txt
- 방장 Start 버튼
- 서버 기준 카운트다운
- 5초 후 중앙 원형 AoE 표시
- 7초에 AoE 안에 있으면 fail 표시
```

### Phase 2. 기믹 타임라인

```txt
- JSON 기반 mechanic timeline
- 특정 시간에 AoE 생성
- 특정 시간에 판정
- reset / replay
```

### Phase 3. 레이드 처리 요소

```txt
- 산개 판정
- 쉐어 판정
- 타워 판정
- 넉백 판정
- 역할별 마커
```

### Phase 4. Room 기능 강화

```txt
- 방 코드
- 비공개 방
- 방장 권한
- 관전자 모드
- 준비 완료
```

### Phase 5. 공개 베타

```txt
- DB
- 공개 기믹 목록
- 사용자 피드백
- 에러 모니터링
- 기본 관리자 기능
```

---

## 28. Codex에게 전달할 최종 작업 요청

아래 요청을 Codex에게 전달한다.

```txt
이 SPEC.md를 기준으로 8인 멀티 2.5D 레이드 시뮬레이터 0차 MVP를 구현해줘.

가장 중요한 목표는 다음이야.

1. pnpm monorepo를 구성한다.
2. apps/web은 Next.js + React Three Fiber로 만든다.
3. apps/server는 Colyseus로 만든다.
4. packages/shared에는 공통 타입과 상수를 둔다.
5. 하나의 RaidRoom에 최대 8명이 접속할 수 있게 한다.
6. 사용자는 MT, ST, H1, H2, D1, D2, D3, D4 중 하나의 역할을 선택한다.
7. 이미 선택된 역할은 중복 선택할 수 없게 서버에서 검증한다.
8. 각 플레이어는 원통으로 표시하고 원통 위에 역할 라벨을 표시한다.
9. WASD 입력을 서버로 보내고, 서버가 위치를 계산한다.
10. 서버 상태를 모든 클라이언트에 동기화해 서로의 위치가 보이게 한다.
11. 마우스 우클릭 드래그로 카메라를 회전하고, 마우스 휠로 줌인/줌아웃한다.
12. 우클릭 기본 메뉴는 뜨지 않게 한다.
13. 사용자가 나가면 다른 화면에서도 해당 원통이 사라지게 한다.

이번 작업에서 기믹, 장판 판정, DB, 로그인, Redis, 배포 설정, 공식 FFXIV 에셋은 구현하지 마.

구현 후에는 실행 방법, 폴더 구조, 주요 파일 설명, 로컬 테스트 방법을 README에 정리해줘.
```
