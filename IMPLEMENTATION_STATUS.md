# Raid Simulator MVP 구현 현황

이 문서는 다음 작업자 또는 AI agent가 현재 프로젝트 상태를 빠르게 이어받기 위한 개발 인수인계 문서다.

> 변경 이력은 [`CHANGELOG.md`](CHANGELOG.md), 실시간 이동 동기화(예측/재조정) 설계는 [`docs/NETCODE.md`](docs/NETCODE.md), 그동안 겪은 동기화 이슈 회고는 [`docs/REALTIME_RETROSPECTIVE.md`](docs/REALTIME_RETROSPECTIVE.md) 참고. 변경 작업 시 `CHANGELOG.md`를 함께 갱신할 것.

## 현재 상태 요약

`CODEX_TASK_Raid_Simulator_MVP_DETAILED.md` 명세를 기준으로 8인 멀티 2.5D 레이드 시뮬레이터 0차 MVP가 구현되어 있다.

현재 핵심 기능:

- `pnpm` monorepo 구성
- `apps/web`: Next.js + React Three Fiber 클라이언트
- `apps/server`: Colyseus 실시간 서버
- `packages/shared`: 공통 타입/상수 패키지
- 최대 8명 Room 접속
- 역할 선택: `MT`, `ST`, `H1`, `H2`, `D1`, `D2`, `D3`, `D4`
- 서버 기준 역할 중복 방지
- 서버 기준 이동 계산
- 카메라 기준 WASD 이동
- 한영키 상태의 `ㅈㅁㄴㅇ` 입력 지원
- 원형 20m 아레나
- 플레이어 원통 표시
- 역할 라벨 표시
- 우클릭 드래그 카메라 회전
- 마우스 휠 줌
- 접속 종료/Leave 시 플레이어 제거
- 바닥 웨이마크 표시

## 실행 방법

```bash
pnpm install
pnpm dev
```

기본 의도 포트:

- Web: `http://localhost:3100`
- Server: `ws://localhost:2567`

웹 개발 서버는 `3000` 충돌을 피하기 위해 `3100` 포트로 고정한다.

개별 실행:

```bash
pnpm dev:web
pnpm dev:server
```

검증 명령:

```bash
pnpm typecheck
pnpm build
```

## 폴더 구조

```txt
apps/
  web/
    src/
      app/
        layout.tsx
        page.tsx
        globals.css
      features/
        simulator/
          components/
            Arena.tsx
            CameraControls.tsx
            ConnectionOverlay.tsx
            JoinPanel.tsx
            PlayerCylinder.tsx
            PlayerLabel.tsx
            SimulatorCanvas.tsx
            SimulatorScene.tsx
            Waymarks.tsx
          hooks/
            useKeyboardInput.ts
            useRaidRoom.ts
          stores/
            simulatorStore.ts
          utils/
            playerColor.ts
    package.json
    next.config.ts
    tsconfig.json

apps/
  server/
    src/
      index.ts
      rooms/
        RaidRoom.ts
      schemas/
        PlayerSchema.ts
        RaidRoomState.ts
      utils/
        movement.ts
        validateJoinOptions.ts
    package.json
    tsconfig.json

packages/
  shared/
    src/
      constants.ts
      index.ts
      roles.ts
      types.ts
    package.json
    tsconfig.json
```

## 주요 파일 설명

### 루트

- `package.json`
  - monorepo scripts 정의
  - `dev`, `dev:web`, `dev:server`, `build`, `typecheck`
- `pnpm-workspace.yaml`
  - `apps/*`, `packages/*` workspace 설정
- `tsconfig.base.json`
  - 공통 TypeScript strict 설정
- `.gitignore`
  - `node_modules`, `.next`, `dist`, `*.tsbuildinfo`, env 파일 제외

### shared

- `packages/shared/src/constants.ts`
  - `ARENA_RADIUS = 20`
  - `MAX_PLAYERS = 8`
  - `PLAYER_MOVE_SPEED = 8`
  - 서버 tick 상수
  - 플레이어 원통 크기 상수
- `packages/shared/src/roles.ts`
  - `PLAYER_ROLES`
  - `PlayerRole`
  - `isPlayerRole`
- `packages/shared/src/types.ts`
  - `ClientInput`
  - `PlayerSnapshot`
  - `JoinOptions`
  - `Vector2Like`
  - `RoomPhase`

현재 `ClientInput`은 다음 형태다.

```ts
export type ClientInput = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  cameraYaw?: number;
};
```

`cameraYaw`는 카메라 기준 이동을 위해 클라이언트가 서버로 보내는 값이다.

### server

- `apps/server/src/index.ts`
  - Express + Colyseus 서버 생성
  - `raid_room` 등록
  - `2567` 포트 listen
- `apps/server/src/rooms/RaidRoom.ts`
  - `maxClients = 8`
  - `onAuth`에서 입장 전 검증
  - `onJoin`에서 플레이어 추가
  - `onLeave`에서 플레이어 제거
  - `input` 메시지 수신
  - simulation interval에서 위치 업데이트
- `apps/server/src/utils/validateJoinOptions.ts`
  - 이름 필수
  - 이름 20자 제한
  - 역할 유효성 검증
  - 정원 초과 검증
  - 역할 중복 검증
- `apps/server/src/utils/movement.ts`
  - 입력 검증
  - 역할별 초기 위치
  - 서버 기준 이동 계산
  - 원형 아레나 boundary clamp
  - `cameraYaw`가 있으면 카메라 기준 이동 계산

좌표 정책:

- 북쪽: `z` 감소
- 남쪽: `z` 증가
- 동쪽: `x` 증가
- 서쪽: `x` 감소

카메라 기준 이동:

- 클라이언트가 `cameraYaw`를 서버로 전송한다.
- 서버는 `cameraYaw` 기준 forward/right 벡터를 계산한다.
- 위치 확정은 여전히 서버에서 한다.

### web

- `apps/web/src/app/page.tsx`
  - 단일 페이지 MVP
  - 접속 전: `JoinPanel`
  - 접속 후: `SimulatorCanvas`, `ConnectionOverlay`
- `apps/web/src/features/simulator/hooks/useRaidRoom.ts`
  - Colyseus client 연결
  - `joinOrCreate('raid_room')`
  - Room state 구독
  - `input` 메시지 전송
  - Leave 처리
- `apps/web/src/features/simulator/hooks/useKeyboardInput.ts`
  - WASD/방향키 입력 수집
  - 한영키 상태 입력 지원
  - `ㅈ`: up
  - `ㄴ`: down
  - `ㅁ`: left
  - `ㅇ`: right
  - `event.code`도 함께 사용해서 물리 WASD 키 fallback 지원
  - 약 20fps로 input 전송
- `apps/web/src/features/simulator/stores/simulatorStore.ts`
  - session id
  - players
  - self name/role
  - connection status
  - camera yaw
- `apps/web/src/features/simulator/components/CameraControls.tsx`
  - Drei `OrbitControls`
  - 우클릭 회전
  - 휠 줌
  - pan 비활성화
  - damping/autoRotate 비활성화
  - 매 frame 카메라 yaw를 store에 저장
- `apps/web/src/features/simulator/components/PlayerCylinder.tsx`
  - 플레이어 원통 렌더링
  - 서버 위치를 바로 꽂지 않고 `MathUtils.damp`로 보간
  - 자기 자신은 밝은 노란색
- `apps/web/src/features/simulator/utils/playerColor.ts`
  - 자기 자신: 밝은 노란색
  - `MT`, `ST`: 파란색
  - `H1`, `H2`: 초록색
  - `D1`~`D4`: 빨간색
- `apps/web/src/features/simulator/components/Waymarks.tsx`
  - 아레나 바닥 웨이마크 표시

## 웨이마크 배치

아레나는 반지름 20m 원형 맵이다.

원형 웨이마크:

| 라벨 | 위치 | 색상 | 좌표 |
| --- | --- | --- | --- |
| A | 북쪽 10m | 빨간색 반투명 원 | `(0, -10)` |
| B | 동쪽 10m | 노란색 반투명 원 | `(10, 0)` |
| C | 남쪽 10m | 파란색 반투명 원 | `(0, 10)` |
| D | 서쪽 10m | 보라색 반투명 원 | `(-10, 0)` |

사각 웨이마크:

| 라벨 | 위치 | 색상 | 좌표 |
| --- | --- | --- | --- |
| 1 | 북서 15m | 빨간색 반투명 사각 | `(-15, -15)` |
| 2 | 북동 15m | 노란색 반투명 사각 | `(15, -15)` |
| 3 | 남동 15m | 파란색 반투명 사각 | `(15, 15)` |
| 4 | 남서 15m | 보라색 반투명 사각 | `(-15, 15)` |

주의: `(-15, -15)` 등 대각 좌표는 원점에서의 실제 유클리드 거리가 약 21.2m라서 반지름 20m 원 밖에 걸칠 수 있다. 사용자가 "북서 15m 지점"을 좌표축 기준으로 요청했기 때문에 현재는 `x/z = ±15`로 구현했다. 만약 "중심에서 대각선 방향 거리 15m"가 의도라면 좌표는 `15 / sqrt(2) ≈ 10.61`을 사용해야 한다.

## 현재 디자인/UX 상태

Join 화면:

- 중앙 패널
- 이름 입력
- 역할 버튼 8개
- Join 버튼
- 오류 메시지 표시

Simulator 화면:

- 전체 화면 R3F Canvas
- 좌상단 overlay
- 내 이름/역할
- 접속 상태
- 현재 플레이어 수
- Leave 버튼
- 조작법 표시

## 구현된 조작

이동:

- `W` / `ㅈ` / `ArrowUp`
- `A` / `ㅁ` / `ArrowLeft`
- `S` / `ㄴ` / `ArrowDown`
- `D` / `ㅇ` / `ArrowRight`

카메라:

- 우클릭 드래그: 회전
- 휠: 줌
- pan 비활성화
- damping 비활성화

## 검증된 내용

실행/빌드 검증:

```bash
pnpm typecheck
pnpm build
```

둘 다 통과한 상태다.

브라우저에서 확인한 내용:

- Join 화면 스타일 정상 적용
- Join 후 3D 아레나 진입
- 플레이어 원통 표시
- 플레이어 수 표시
- 서버 `ws://localhost:2567` 응답

중복 역할 검증:

- Colyseus client 스모크 테스트로 같은 역할 중복 입장이 거부되는 것을 확인했다.

## 주의사항

### Next dev 포트

로컬에 `3000`, `3001` 등이 이미 점유되어 있으면 Next가 자동으로 다른 포트를 사용한다.

현재 작업 중 자주 확인된 주소:

- `http://localhost:3002`

사용자가 "디자인이 안 먹는다", "Join이 안 된다"고 하면 오래된 포트에 접속 중일 가능성이 있다. dev 로그의 `Local:` 주소를 먼저 확인할 것.

### Next dev 캐시

한 번 `.next` 캐시가 꼬여 CSS asset이 404가 난 적이 있다.

증상:

- HTML은 뜸
- CSS가 적용되지 않음
- Join 버튼이 hydration되지 않아 동작하지 않음

해결:

```bash
rm -rf apps/web/.next apps/web/tsconfig.tsbuildinfo
pnpm dev
```

### 서버 dev 스크립트

`tsx`가 이 환경에서 macOS temp pipe 권한 문제를 일으켜서, 서버 dev는 다음 방식으로 구성했다.

```json
"dev": "pnpm build && node dist/index.js"
```

즉 서버 코드를 바꾸면 dev 서버 재시작이 필요하다.

### Colyseus Schema 설정

서버 `tsconfig.json`에는 다음 설정이 중요하다.

```json
"experimentalDecorators": true,
"useDefineForClassFields": false
```

`useDefineForClassFields: false`가 없으면 Schema field sync가 제대로 되지 않을 수 있다.

## 아직 구현하지 않은 것

명세상 제외된 항목은 여전히 제외 상태다.

- 레이드 기믹
- 장판 판정
- HP/데미지/힐
- 스킬
- 로그인/회원가입
- DB
- Redis
- 방 목록
- 매칭
- 관전자 모드
- 채팅
- 음성 채팅
- 리플레이
- 공식 FFXIV 에셋/아이콘/사운드
- 배포 설정

## 다음 작업 후보

우선순위 높은 개선 후보:

1. 방 코드 또는 Room 분리
2. 현재 방 역할 점유 상태를 Join 화면에서 표시
3. Start/Reset 버튼
4. 방장 개념
5. 준비 완료 상태
6. 간단한 AoE 표시 및 서버 기준 판정
7. 웨이마크 편집 UI
8. 카메라 기준 이동과 맵 기준 이동 토글
9. 모바일/작은 화면 UI 개선
10. 테스트 자동화

## 마지막 작업 메모

가장 최근 변경:

- 사각 숫자 웨이마크 `1`~`4`를 중심 기준 15m 좌표로 변경했다.
- 현재 좌표는 `(-15, -15)`, `(15, -15)`, `(15, 15)`, `(-15, 15)`이다.
- 이 좌표는 대각선 실제 거리 기준으로는 반지름 20m 밖이다. 의도 확인이 필요할 수 있다.
