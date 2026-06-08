# Changelog

이 프로젝트의 주요 변경 이력. 다음 작업자/agent가 작업 내용을 추적할 수 있도록 유지한다.
형식은 [Keep a Changelog](https://keepachangelog.com/)를 느슨하게 따르며, 날짜는 `YYYY-MM-DD`.

## [Unreleased]

### 2026-06-08

#### 보스 기믹 "행방불명" 1단계 + 기믹 컨트롤
- 기믹 선택 + **시작/중지/재시작** 컨트롤 패널 추가(`GimmickPanel`, 메시지 `"gimmick"`).
- 서버 권위 기믹 엔진 `GimmickController`(타임라인 스케줄러 + 판정)와 스키마(`TowerSchema`/`AoeSchema`, `PlayerSchema.marker*`, `RaidRoomState` 기믹 필드) 추가.
- 구현 범위(1단계, draft 권고): 광역 + 1차 머리징(쉐어2/부채꼴3/산개3, 패턴 A·B), **8회 탑**(중앙 10m·90도 2개·라운드마다 45도 회전), 탑 인원 판정(정확히 2명), 쉐어/산개/부채꼴 공격 판정 + 중첩(즉사) 판정, 공격 범위 표시(옅은 주황, 1초), 탑 처리 후 머리징 재분배(규칙 5.1 + 4회 제한), 짝수 탑 보스 미래/과거 캐스팅 표시, 성공/실패 로그.
- 클라 렌더: 보스(중앙·히트박스 4m), 탑(고리+8초 채움), 머리 위 머리징 칩, 공격 범위(원/부채꼴), 보스 캐스팅 텍스트, 컨트롤·로그 오버레이.
- **미구현(2단계, 분리):** 분신 소환 + 주시 + 소멸의 발차기(섹션 8·9). 보스 미래/과거 캐스팅 "표시"만 구현됨.
- 명세/진행: [`docs/mechanics/boss-pattern-draft.md`](docs/mechanics/boss-pattern-draft.md), [`docs/mechanics/missing-implementation.md`](docs/mechanics/missing-implementation.md)

#### 네트코드 버그 수정 — 상대 위치 오버슈트 / 정지 후 이동
- **증상:** ① 상대 화면에서 내가 키를 뗐는데도 잠깐 더 미끄러져 나감 ② 멈췄을 때 실제 위치와 상대가 보는 위치가 어긋남.
- **원인:** Colyseus는 위치 변화 시에만 패치를 보내는데, 상대 보간이 데이터가 끊기면 마지막 속도로 **외삽**해 멈춘 상대를 계속 앞으로 미끄러뜨림(오버슈트).
- **수정:** 상대 외삽 제거 → 업데이트가 끊기면 **마지막 위치 유지(hold)**. 정지 위치가 마지막 패치값이라 hold가 정확.
- **추가:** 창 포커스 상실 시 keyup 누락으로 자기 캐릭터가 계속 이동하는 것을 막기 위해 `blur`에서 입력 강제 해제.


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
