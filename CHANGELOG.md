# Changelog

이 프로젝트의 주요 변경 이력. 다음 작업자/agent가 작업 내용을 추적할 수 있도록 유지한다.
형식은 [Keep a Changelog](https://keepachangelog.com/)를 느슨하게 따르며, 날짜는 `YYYY-MM-DD`.

## [Unreleased]

### 2026-06-12

#### P3 주사위 기믹 (공략보기) + 멀티 기믹 선택
- **P3 주사위(`dice`) 공략보기 추가** — 보스 공격(알테마 블래스터 회전 직선 / 중앙 연두 장판 / 주사위 유도 직선)을 텔레그래프로 표시하고, 그 안전지대로 서는 위치를 매 판 랜덤 구성에서 계산으로 생성(`scenarios/diceScenario.ts`, `useScenarioPlayback(gimmickId="dice")`).
  - 타임라인: 3s #1 → 2s 간격 8발(#8=17s), 9s 넉백, 10s 연두장판 쉐어, 13s 주사위 1~8 부여, 22s(#8+5s) 주사위 1초 간격 유도.
  - 위치 공식: #1 도착점=12시, 회전 반대방향 22.5°+45°×N → 웨이마크 사이 맵끝. 보스 13m·지름10m.
  - 판정(1대/2대) 미구현(공략보기 전용).
- **멀티 기믹 선택 재도입**: `GIMMICKS` 레지스트리, 로비 "공략 보기 기믹" 선택(`JoinPanel`), `useScenarioPlayback` gimmickId 분기.
- **도형/표시 추가**: `AoeView` 직선(`rect`)·연두 장판(`stack`)·위험(빨강) + `AoeIndicators` 렌더, 주사위 배지(`PlayerSnapshot.dice`, 홀=파랑/짝=빨강).
- **문서 정합성 수정**: `MECHANIC_PATTERN_TEMPLATE.md` 웨이마크 좌표 예시를 실제 구현(8방향 13m 동일)에 맞게 갱신.
- 명세/현황: [`docs/mechanics/dice-draft.md`](docs/mechanics/dice-draft.md).
- 보정: 순서 정정(주사위@#5, 연두장판@#6, 유도@#8+6s), 알테마 블래스터를 **빨간 직선 → 연보라 투사체가 중앙 관통 이동**으로, 보스를 **웨이마크 위(13m)** 로 배치(스토어 boss 좌표/반지름), **동선보기 선택 대상이 중앙 고정되던 버그 수정**(self id 미설정).
- 추가 보정: "공략 보기" → **"동선 보기"** 로 명칭 변경.
- 재보정: 블래스터 투사체를 **막대 없는, 높이 있는 화살촉**(반구 제거)으로; **넉백을 보스 기준 10m 강제 이동**으로; **#9~16을 투사체가 아니라 빨간 직선 범위**로 통합 — 시작점을 45°씩(같은 회전방향) 회전시키며 각 주사위 번호 대상 방향으로 동시에 2초 표시(이전의 투사체 발사/8방향-동시 중복 제거).

### 2026-06-10

#### 서버 운영 로그 (Render Logs 조회용)
- 한글 태그로 통일된 서버 로그 추가(타임스탬프는 Render가 자동 부착):
  - `[서버] 시작/깨어남` — 콜드 스타트 및 슬립에서 깨어날 때(프로세스 재시작)
  - `[방생성]`/`[방삭제]` — `roomId` + 현재 방 수(`방수=n/30`)
  - `[입장]`/`[퇴장]` — `roomId` + 역할 + 방 내 인원(`인원=n/8`)
  - `[만료]` — 15분 수명 만료로 전원 연결 해제
  - `[유휴퇴장]` — 3분 무입력 연결 해제
- Render 대시보드 Logs 탭에서 실시간 tail·검색 가능. (무료 티어는 보존 기간 짧음 → 장기 보관 시 Log Stream 드레인 필요)

#### 방 운영 한도 + 수명 + 시각/부하 개선
- **동시 방 30개 한도** — 초과 시 방 만들기 거부(`activeRoomCount`, `MAX_ROOMS`).
- **방 수명 15분** — 만료 시 전원 연결 해제, 빈 방은 자동 삭제(autoDispose). 오버레이에 **남은 시간(mm:ss)** 표시(60초 이하 경고색).
- **무입력 3분 연결 해제**(기존 유지), **모든 사용자 이탈 시 방 삭제**(autoDispose).
- **서버 부하 절감**: 봇 전략 위치 계산을 프레임당 8회→**1회**로(`computeStrategyPositions` 공유). 30방×15분 가정 시 메모리/CPU 여유 확인.
- **UI 가독성**: 시뮬 오버레이의 내 역할·초대 코드/복사·역할 변경·잠금 표시가 밝은 패널에서 안 보이던 색상 수정.
- **탑 진행 구체**: 작은 구체 → **탑과 같은 크기 + 반투명**으로, 판정 시 바닥에 닿게.

#### 로비 UI 가독성 수정
- 방 코드 입력칸(`.code-input`)과 "코드로 참여" 보조 버튼(`.join-button.secondary`)이 어두운 테마 색이라 밝은 로비 패널에서 보이지 않던 문제 수정 → 밝은 패널 테마(흰 배경·어두운 글자, 포커스 강조, placeholder 색)로 통일.

#### 탑 좌/우 배정 안정화
- **홀수탑 쉐어 좌/우를 짝수탑과 동일 규칙으로** — `placeOddTowerPlayers`가 자체 우선순위 계산 대신 `sideAssignments`(첫 부여=역할군 우선순위, 재지정=현재 탑 쪽 유지·같은 쪽 몰리면 보스에 가까운 쪽 유지) 사용. (부채꼴=왼쪽/산개=오른쪽 고정은 유지)
- **좌/우를 판정 순간 위치로 고정** — `BotController`가 라운드 시작 첫 틱(직전 판정 위치)에서 위치 스냅샷을 떠 그 라운드 내내 좌/우를 계산. 봇이 매 프레임 live 위치로 재계산하며 발차기·이동 중 좌/우가 뒤집히던 흔들림 제거.

#### 멀티룸 + 초대코드 개편
- **방 생성 / 코드로 참여** 구조로 전환. Colyseus 방을 `setPrivate(true)`로 만들어 자동 매칭에서 제외하고, **roomId를 초대코드**로 사용(`client.create` / `client.joinById`).
- **여러 시뮬레이션 방이 동시 존재** 가능 — 방마다 상태 독립.
- **멀티룸을 깨던 전역 상태 제거**: `RaidRoom`의 모듈 전역 `occupiedHumanRoles`/`simulationRunning`과 `GET /state` 점유 엔드포인트 삭제(방마다 섞이던 문제 해결).
- **로비 개편**: 역할 선택 + 방 코드 입력 → "방 만들기" / "코드로 참여" (`JoinPanel`). `?room=코드` 쿼리로 들어오면 코드 자동 채움 → 역할만 골라 입장.
- **초대 공유**: 시뮬 내 오버레이에 방 코드 표시 + `?room=코드` **초대 링크 복사** 버튼.
- **시뮬 내 역할 변경**: `setRole` 메시지(진행 중에는 불가, 다른 사람이 점유한 역할 거부, 봇 점유 시 봇 비움). 오버레이에 역할 변경 셀렉트.
- 클라 `useRaidRoom`: `join`→`createRoom`/`joinRoom`/`setRole`로 재구성, 스토어에 `roomId` 추가, 자기 역할 변경을 상태에서 반영.

#### 행방불명 시뮬레이션 동작/UX 보완
- **봇 이동 속도**를 플레이어와 동일(`PLAYER_MOVE_SPEED`)하게 — 시작 시 먼 대형에서도 탑까지 제때 도달.
- **탑 간격을 작동시간과 동일(`TOWER_INTERVAL_MS` 10s→8s)** — 탑 판정과 동시에 다음 탑이 즉시 등장(공격 범위 주황 장판도 판정 즉시 표시).
- **실패 중단 시 플레이어/봇 컨트롤 정지** — `RaidRoomState.controlsLocked` 추가, 실패 중단 시 서버가 이동 입력을 무시하고 클라가 입력/예측을 비활성화(중단/재시작 시 해제).
- **진행 중 입장 차단** — `validateJoinOptions`가 `gimmickPhase==="running"`이면 입장 거부, `GET /state`에 `running` 노출, 로비에서 안내·버튼 비활성화. 중단 상태에서만 입장 가능.
- **내 역할(역할군) 표기** — 오버레이에 컨트롤 중인 역할 + 역할군(탱커/힐러/근딜/원딜) 배지.
- (확인) 범위 공격 2개 이상 중첩 피격 시 실패 처리는 기존 `resolveMarkerAttacks`에 이미 구현됨.

#### 행방불명 후속 처리 정비 (커밋 `0532356` "Tune missing mechanic follow-up handling")
- **발차기 유도 버그 수정(이전 항목의 A·B 해결)**:
  - 다음 탑 방향을 실제 상태에서 읽도록 변경 — `RaidRoomState`에 `missingBaseIndex`/`missingRotationDirection` 노출, `getTowerPairByRound`가 이를 사용(고정 `base=3`·rotDir 무시 제거).
  - 미래/과거를 실제 발생값으로 — `lastEvenBossCast`를 노출하고 `getEvenRoundCast`가 이를 읽음(`round%4` 결정론 추측 제거).
- **위치 규칙 단일 출처 문서**: [`docs/mechanics/missing-position-rules.md`](docs/mechanics/missing-position-rules.md) 추가 — 가이드 봇/공략보기 위치의 source of truth. 홀 탑(쉐어2·부채꼴1·산개1)/짝 탑(부채꼴2·산개2) 구성, 보스·탑 교차점 기반 좌우 배치, 비활성 시계 배치, 발차기 유도 규칙.
- **위치 로직 재작성**: `missingStrategy.ts`를 위 규칙대로 정밀 재작성(보스/탑 교차점, 탑 경계 0.3m 안쪽 등).
- **우선순위징(priorityMarker)**: `number1/2`·`forbid1/2` 타입 추가, 마지막 탑에서 `assignFinalPriorityMarkers`로 부여, 머리 위 숫자/금지 아이콘 표시(`PlayerLabel`).
- **분신 시각화 준비**: `AoeSchema.kind`에 `clone`/`cloneSpot` 추가 및 렌더(`CloneSpot`).
- 기타: `SimulatorCanvas` 분리, Boss 캐스팅 표시 정리, 카메라/타워/AoE 미세 조정.

### 2026-06-09

#### 행방불명 공략 시뮬레이션 (가이드 봇 / 공략보기 / 컨트롤 확장)
- **가이드 봇**: 라이브룸 시작 시 빈 역할을 서버 권위 봇으로 자동 보충(`apps/server/src/bots/BotController.ts`). 봇은 실제 랜덤 규칙(탑 방향/머리징/미래·과거)을 따르며 정답 위치로 이동. 첫 머리징 후 1초 대기 뒤 이동 시작.
- **전략 위치 계산**: `packages/shared/src/missingStrategy.ts` 추가 — 조 배정(쉐어 페어=1조, 1조=탑1·2·3·8 / 2조=탑4·5·6·7), 좌/우 탑 배정(첫 부여 vs 재지정 규칙), 탑 주인·쉐어 도우미·부채꼴 미끼·비활성 위치(홀/짝 라운드 시계 배치).
- **공략보기(가이드 재생)**: 선택 역할을 카메라 포커스로, 모든 역할이 스크립트 위치를 따라감(`useScenarioPlayback.ts`). 카메라가 조종 캐릭터를 따라가도록 변경(`CameraControls`).
- **컨트롤 확장**: 일시정지/재개, 실패 즉시 중단 옵션(기본 ON), 로비 역할 조회(`GET /state`)로 이미 점유된 역할 버튼 비활성화.
- **시각/표시**: 보스 캐스팅 진행바(`행방불명`/미래/과거), 머리징을 텍스트→도형 아이콘(쉐어/산개/부채꼴), 분신 미끼·발차기 인디케이터, 탑 채움이 `elapsed` 기준이라 일시정지와 함께 멈춤.
- **수치 튜닝**: 보스 히트박스 6.5m, 탑 8m·중심 8.5m, 쉐어 4.5m·산개 4m, 시작 광역 캐스팅 `MISSING_CAST_MS`.
- 상세 작업목록: [`docs/mechanics/missing-simulator-worklog.md`](docs/mechanics/missing-simulator-worklog.md), 현황/미구현: [`docs/mechanics/missing-implementation.md`](docs/mechanics/missing-implementation.md)
- ⚠️ 알려진 점검 필요: 발차기 유도가 다음 탑 방향을 `base=3` 고정 + rotDir 무시로 추측(`getTowerPairByRound`), 미래/과거를 `round%4` 결정론으로 추측(`getEvenRoundCast`) → 실제 랜덤 상태와 어긋날 수 있음. **(→ 2026-06-10 커밋 `0532356`에서 해결)**

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
