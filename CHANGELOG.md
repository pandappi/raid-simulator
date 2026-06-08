# Changelog

이 프로젝트의 주요 변경 이력. 다음 작업자/agent가 작업 내용을 추적할 수 있도록 유지한다.
형식은 [Keep a Changelog](https://keepachangelog.com/)를 느슨하게 따르며, 날짜는 `YYYY-MM-DD`.

## [Unreleased]

### 2026-06-08

#### 네트코드 — 클라이언트 예측 + 서버 재조정 (정석 구현)
- **문제:** 방향키를 계속 누르고 있으면 예측 위치가 서버의 지연된 위치로 끌려가 주기적으로 롤백되는 현상.
- **해결:** Gabriel Gambetta의 *Client-Side Prediction & Server Reconciliation* 모델로 교체.
  - 모든 입력 명령에 순번(`seq`)과 적용 시간(`dt`)을 부여해 전송 (`ClientInput`에 필드 추가).
  - 서버는 명령을 받은 `dt` 그대로 `stepMovement`로 재현하고, 마지막 처리 순번을 `PlayerSchema.lastSeq`로 echo.
  - 서버 이동을 고정 틱(`setSimulationInterval`) 방식에서 **명령 기반**으로 전환 (결정론적 일치 확보).
  - 클라는 서버 스냅샷 수신 시 권위 위치로 맞춘 뒤 **미확인 입력만 재적용(replay)** → 롤백 제거.
  - 제거: 거리 임계 스냅/유휴 정렬 등 휴리스틱(롤백 유발 원인).
  - 신규: `usePrediction` 훅(rAF 고정 스텝 예측·전송), `netcode.advance/getSelfState`.
- 자료: [Gambetta](https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html), [Web Game Dev](https://www.webgamedev.com/backend/prediction-reconciliation)
- 상세 설계: [`docs/NETCODE.md`](docs/NETCODE.md)

#### 그 이전 네트코드 반복 (같은 날)
- 자기 캐릭터 예측 + 상대 보간/외삽 최초 도입 (`netcode.ts`), 이동 로직을 `packages/shared/stepMovement`로 추출(서버·클라 공유).
- 멈출 때 뒤로 끌렸다 오는 현상 1차 완화(서버 정지 후에만 정렬) → 최종적으로 위 정석 구현으로 대체.
- 입력 즉시 전송 + 보간 지연 100ms→70ms로 위치 격차 축소.

#### UX / 씬
- 입장 시 **이름 입력 제거** — 역할만 선택해 입장(빈 이름은 서버에서 역할명으로 대체).
- 사각 웨이마크(1~4)를 중앙에서 **15m** 위치(대각선)로 이동.
- 사각 웨이마크 채움이 다이아몬드로 보이던 문제 수정(테두리 사각형과 정렬).
- 원형판을 평면 → **두께 2m 입체 원판**(윗면 y=0), 색상 더 밝은 회색(`#aeb6bd`).

#### 배포
- 프론트(`apps/web`) → Vercel, 게임 서버(`apps/server`) → Render(`render.yaml`).
- 서버 CORS를 `CLIENT_ORIGIN` 환경변수로 분리.
- Render 빌드: corepack 서명 키 오류 회피 위해 `npm i -g pnpm`으로 설치.
- Vercel: Root Directory `apps/web`, web 빌드 전에 shared 빌드.
