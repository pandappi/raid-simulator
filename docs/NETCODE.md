# 네트코드 설계 (Client-Side Prediction + Server Reconciliation)

실시간 멀티플레이 이동의 체감 지연·롤백을 없애기 위한 구조. 표준 기법인
[Gabriel Gambetta의 Client-Side Prediction & Server Reconciliation](https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html)을 따른다.

## 핵심 아이디어

서버가 위치의 **권위(authority)** 를 갖되, 클라이언트는 입력 결과를 **즉시 예측**해 보여주고,
서버 응답이 오면 어긋난 부분만 조용히 **재조정(reconcile)** 한다.

1. 클라는 모든 입력에 순번 `seq`와 적용 시간 `dt`를 붙여 전송하고, 동시에 로컬에서 즉시 적용(예측).
2. 서버는 받은 명령을 **같은 `dt`로 그대로 재현**(`stepMovement`)하고, 마지막 처리 순번을 상태에 echo(`lastSeq`).
3. 클라는 서버 스냅샷을 받으면: 권위 위치로 맞춘 뒤 `seq > lastSeq`인 **미확인 입력만 다시 적용**한다.
   → 예측 위치 = 권위 위치 + 아직 처리 안 된 입력 → **롤백이 발생하지 않는다**.

서버와 클라가 동일한 결정론적 함수(`packages/shared/movement.ts`의 `stepMovement`)를
동일한 `dt`로 적용하므로 두 위치는 정합한다.

## 데이터 흐름

```
[키 입력] useKeyboardInput → setMoveInput(보유 입력)
                                   │
[매 프레임] usePrediction → netcode.advance(frameDt, cameraYaw, send)
   - 고정 스텝(CLIENT_SIM_DT=1/60)마다 명령 {seq, dt, keys, cameraYaw} 생성
   - 로컬 예측에 적용(selfPredicted) + pending에 보관 + 서버로 send
                                   │ (WebSocket "input")
[서버] RaidRoom.onMessage("input")
   - updatePlayerPosition(player, cmd, clamp(cmd.dt))  // 동일 재현
   - player.lastSeq = cmd.seq
                                   │ (Colyseus 상태 패치, ~20Hz)
[클라] useRaidRoom → netcode.ingestSnapshot(id, x, z, rot, lastSeq)
   - 자기: 권위 위치로 리셋 → pending에서 seq<=lastSeq 제거 → 나머지 replay
   - 상대: 스냅샷 버퍼에 적재
                                   │
[렌더] PlayerCylinder (useFrame)
   - 자기: getSelfState()  (강한 댐핑으로 드문 보정만 흡수)
   - 상대: sampleRemote()  (INTERP_DELAY 과거 시점 보간, 끊기면 외삽)
```

## 자기(self) vs 상대(remote)

- **자기:** 예측 + 재조정. 입력 즉시 반응, 서버 보정은 replay로 흡수 → 롤백 없음.
- **상대:** 예측 불가(남의 입력을 모름)하므로 **보간(interpolation)**. 스냅샷을 `INTERP_DELAY`(70ms)
  만큼 과거로 렌더링해 20Hz 업데이트를 매끄럽게 잇는다. 업데이트가 끊기면(=상대가 정지) **마지막
  위치를 유지(hold)** 한다 — 외삽하지 않는다.
  → 상대는 항상 약간 과거(네트워크 지연)로 보이며, 이는 모든 온라인 게임 공통이다.

  > ⚠️ **외삽 금지 이유:** Colyseus는 위치가 바뀔 때만 패치를 보낸다. 정지하면 마지막 패치값이 곧
  > 실제 정지 위치이므로, 속도로 외삽하면 멈춘 상대를 계속 앞으로 미끄러뜨려(오버슈트) 실제 위치와
  > 어긋난다. 그래서 끊긴 구간은 hold가 정답이다.

## 주요 상수 (`packages/shared/constants.ts`, `apps/web/.../netcode.ts`)

| 상수 | 값 | 의미 |
|---|---|---|
| `CLIENT_SIM_DT` | 1/60s | 예측·명령 고정 스텝 |
| `MAX_INPUT_DT` | 0.1s | 서버가 한 명령에 허용하는 최대 dt(과속 방지) |
| `INTERP_DELAY` | 70ms | 상대 보간 지연(작을수록 실시간↑, 끊김 위험↑) |

## 관련 파일

- `packages/shared/movement.ts` — `stepMovement` (서버·클라 공유 이동 계산)
- `apps/server/src/rooms/RaidRoom.ts` — 명령 기반 이동 + `lastSeq` echo
- `apps/web/src/features/simulator/netcode.ts` — 예측/재조정/보간 핵심
- `apps/web/src/features/simulator/hooks/usePrediction.ts` — 프레임 루프(예측·전송)
- `apps/web/src/features/simulator/hooks/useKeyboardInput.ts` — 입력 캡처

## 알려진 한계 / TODO

- **치팅 방지 미흡:** 서버는 `dt`만 상한 클램프할 뿐, 명령 빈도를 실시간 기준으로 제한하지 않는다.
  경쟁 게임이라면 서버 측 시간 예산(elapsed-time budget) 검증 필요. (현재는 협동 시뮬레이터라 보류)
- 시계 동기화 없이 도착 시각 기준으로 보간하므로, 심한 지터 환경에선 `INTERP_DELAY` 상향이 필요할 수 있다.
