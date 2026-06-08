# Raid Simulator MVP

8명이 같은 Room에 접속해 역할을 선택하고, 2.5D 원형 아레나에서 WASD 이동을 실시간 동기화하는 0차 MVP입니다.

## 실행 방법

```bash
pnpm install
pnpm dev
```

개별 실행도 가능합니다.

```bash
pnpm dev:server
pnpm dev:web
```

기본 주소:

- Web: http://localhost:3000
- Server: ws://localhost:2567

`3000` 포트가 이미 사용 중이면 Next.js가 `3001` 같은 사용 가능한 포트로 자동 전환합니다.

웹 클라이언트는 기본적으로 `ws://localhost:2567`에 접속합니다. 서버 주소를 바꾸려면 `apps/web/.env.local`에 다음 값을 설정하세요.

```env
NEXT_PUBLIC_GAME_SERVER_URL=ws://localhost:2567
```

## 폴더 구조

```txt
apps/
  web/        Next.js + React Three Fiber 클라이언트
  server/     Colyseus 실시간 서버
packages/
  shared/     공통 타입, 역할, 상수
```

## 구현된 기능

- `pnpm` monorepo
- Next.js 단일 페이지 클라이언트
- Colyseus `raid_room` Room
- 최대 8명 접속 제한
- `MT`, `ST`, `H1`, `H2`, `D1`, `D2`, `D3`, `D4` 역할 선택
- 서버 기준 역할 중복 방지
- 서버 tick 기반 위치 계산
- WASD/방향키 입력 전송
- 대각선 이동 normalize
- 원형 아레나 경계 clamp
- 원통 플레이어와 역할 라벨 렌더링
- 내 플레이어 강조 표시
- 우클릭 드래그 카메라 회전
- 마우스 휠 줌
- Leave 버튼과 접속 종료 시 플레이어 제거

## 구현하지 않은 기능

- 레이드 기믹, 장판 판정, HP, 스킬
- 로그인, DB, Redis
- 방 목록, 매칭, 관전자 모드
- 채팅, 음성 채팅, 리플레이
- 공식 FFXIV 에셋, 아이콘, 사운드
- 배포 설정

## 로컬 테스트

1. `pnpm dev`를 실행합니다.
2. 브라우저 탭 A에서 이름 `Alice`, 역할 `MT`로 입장합니다.
3. 브라우저 탭 B에서 이름 `Bob`, 역할 `ST`로 입장합니다.
4. 탭 A에서 WASD로 이동했을 때 탭 B의 `MT` 원통이 움직이는지 확인합니다.
5. 탭 B에서 WASD로 이동했을 때 탭 A의 `ST` 원통이 움직이는지 확인합니다.
6. 탭 B에서 이미 선택된 `MT`로 입장 시도하면 에러가 보여야 합니다.
7. Leave 버튼이나 탭 닫기로 나가면 다른 탭에서 해당 원통이 사라져야 합니다.

## 개발 명령

```bash
pnpm typecheck
pnpm build
```
