# 보스 패턴 입력 템플릿 제안

이 문서는 여러 레이드 기믹을 데이터로 작성하기 위한 보스 패턴 템플릿이다.

목표:

- 기믹을 코드에 직접 하드코딩하지 않는다.
- 하나의 JSON 파일로 한 기믹 또는 한 페이즈를 표현한다.
- 서버가 타임라인을 읽고 telegraph, resolve, 판정을 실행할 수 있게 한다.
- 나중에 웹 UI 에디터로 확장하기 쉬운 구조를 유지한다.

## 권장 파일 구조

```txt
content/
  mechanics/
    sample-stack-spread.json
    sample-tower-knockback.json
    boss-phase-1.json
```

아직 구현 전 단계라면 `docs/examples/` 아래에 샘플을 두고, 실제 런타임에서 읽기 시작할 때 `content/mechanics/`로 옮기는 것을 권장한다.

## 핵심 개념

패턴 파일은 크게 네 부분으로 나눈다.

```txt
metadata
setup
timeline
success
```

### metadata

기믹의 이름, 설명, 버전, 작성자, 태그를 담는다.

### setup

기믹 시작 시 필요한 초기 상태를 담는다.

예:

- 아레나 반지름
- 보스 위치
- 기본 웨이마크
- 플레이어 시작 위치를 강제할지 여부

### timeline

서버 기준 시간순 이벤트 목록이다.

예:

```txt
0.0초: 기믹 시작 메시지
2.0초: 산개 마커 부여
5.0초: AoE telegraph 표시
7.0초: AoE 판정
8.5초: 결과 메시지
```

### success

기믹 전체 성공/실패 기준이다.

## 시간 단위

모든 시간은 초 단위 number를 권장한다.

```json
{ "at": 3.5 }
```

서버 내부에서는 ms로 변환해도 되지만, 사람이 작성하는 파일은 초가 읽기 쉽다.

## 좌표계

현재 프로젝트 좌표계:

```txt
중앙: (0, 0)
북쪽: z 감소
남쪽: z 증가
동쪽: x 증가
서쪽: x 감소
```

JSON에서는 2D 좌표를 다음처럼 쓴다.

```json
{ "x": 0, "z": -10 }
```

## 기본 템플릿

```json
{
  "schemaVersion": 1,
  "id": "unique-mechanic-id",
  "metadata": {
    "title": "기믹 이름",
    "description": "짧은 설명",
    "author": "작성자",
    "tags": ["spread", "stack", "tower"],
    "difficulty": "normal"
  },
  "setup": {
    "arena": {
      "type": "circle",
      "radius": 20
    },
    "boss": {
      "id": "boss",
      "name": "Boss",
      "position": { "x": 0, "z": 0 },
      "facing": 0
    },
    "waymarks": "default",
    "playerStart": {
      "mode": "keep-current"
    }
  },
  "timeline": [
    {
      "at": 0,
      "type": "message",
      "text": "기믹 시작"
    }
  ],
  "success": {
    "mode": "all-required-checks-pass"
  }
}
```

## 이벤트 타입 제안

처음부터 모든 타입을 구현할 필요는 없다. 다만 템플릿은 확장 가능하게 잡아둔다.

### message

화면에 짧은 안내를 표시한다.

```json
{
  "at": 0,
  "type": "message",
  "text": "산개 준비"
}
```

### assign_markers

역할 또는 플레이어에게 마커를 부여한다.

```json
{
  "at": 2,
  "type": "assign_markers",
  "assignments": [
    { "target": { "role": "MT" }, "marker": "spread" },
    { "target": { "role": "H1" }, "marker": "stack" }
  ]
}
```

### clear_markers

부여된 마커를 제거한다.

```json
{
  "at": 8,
  "type": "clear_markers"
}
```

### spawn_aoe

장판 telegraph를 표시한다.

```json
{
  "at": 3,
  "type": "spawn_aoe",
  "id": "center-circle-1",
  "shape": "circle",
  "position": { "x": 0, "z": 0 },
  "radius": 6,
  "color": "#ff4d4f",
  "opacity": 0.35
}
```

### resolve_aoe

장판을 판정한다.

```json
{
  "at": 5,
  "type": "resolve_aoe",
  "aoeId": "center-circle-1",
  "hitRule": "players-inside-fail",
  "required": true
}
```

### remove_aoe

장판 표시를 제거한다.

```json
{
  "at": 5.2,
  "type": "remove_aoe",
  "aoeId": "center-circle-1"
}
```

### check_positions

역할별 위치 조건을 검사한다.

```json
{
  "at": 6,
  "type": "check_positions",
  "id": "spread-position-check",
  "required": true,
  "rules": [
    {
      "target": { "role": "MT" },
      "condition": "inside_circle",
      "position": { "x": 0, "z": -10 },
      "radius": 3
    }
  ]
}
```

### stack_check

쉐어/스택 인원수를 검사한다.

```json
{
  "at": 7,
  "type": "stack_check",
  "id": "healer-stack",
  "required": true,
  "center": { "target": { "role": "H1" } },
  "radius": 4,
  "minPlayers": 4,
  "maxPlayers": 4
}
```

### spread_check

서로 일정 거리 이상 떨어졌는지 검사한다.

```json
{
  "at": 7,
  "type": "spread_check",
  "id": "spread-check",
  "required": true,
  "targets": { "roles": ["MT", "ST", "H1", "H2", "D1", "D2", "D3", "D4"] },
  "minDistance": 5
}
```

### tower_check

타워 위치와 필요 인원수를 검사한다.

```json
{
  "at": 6,
  "type": "tower_check",
  "id": "north-tower",
  "required": true,
  "position": { "x": 0, "z": -10 },
  "radius": 2.5,
  "requiredPlayers": 1
}
```

### knockback

넉백을 적용한다.

```json
{
  "at": 4,
  "type": "knockback",
  "source": { "x": 0, "z": 0 },
  "distance": 8,
  "targets": "all"
}
```

## target 표현

대상은 역할 기준, 전체, 특정 마커 기준으로 확장할 수 있다.

```json
{ "role": "MT" }
```

```json
{ "roles": ["MT", "ST"] }
```

```json
"all"
```

```json
{ "marker": "spread" }
```

## 판정 결과 정책

각 판정 이벤트는 `required`를 가진다.

```json
{
  "required": true
}
```

- `required: true`: 실패 시 기믹 실패
- `required: false`: 결과만 표시하고 전체 실패에는 반영하지 않음

## 추천 작성 순서

1. 기믹 이름과 목표를 한 줄로 쓴다.
2. 시간순으로 무슨 일이 일어나는지 적는다.
3. telegraph 이벤트를 먼저 배치한다.
4. resolve/check 이벤트를 배치한다.
5. 성공 조건을 정한다.
6. 실제 좌표를 웨이마크 기준으로 다듬는다.

## 좌표 작성 예시

기본 웨이마크 기준:

```txt
A: (0, -10)
B: (10, 0)
C: (0, 10)
D: (-10, 0)
1: (-15, -15)
2: (15, -15)
3: (15, 15)
4: (-15, 15)
```

단, `1`~`4`는 현재 좌표축 기준 15m이므로 원형 반지름 20m 밖에 걸칠 수 있다. 대각선 방향 실제 거리 15m를 원하면 다음 좌표를 사용한다.

```txt
15 / sqrt(2) = 10.61
1: (-10.61, -10.61)
2: (10.61, -10.61)
3: (10.61, 10.61)
4: (-10.61, 10.61)
```

## 다음 구현 단계 제안

처음 구현할 때는 아래 이벤트만 지원해도 충분하다.

1. `message`
2. `spawn_aoe`
3. `resolve_aoe`
4. `remove_aoe`
5. `check_positions`

이후 확장:

1. `assign_markers`
2. `spread_check`
3. `stack_check`
4. `tower_check`
5. `knockback`

## 서버 구현 방향

서버에 `MechanicRunner` 같은 클래스를 둔다.

역할:

- JSON 로드
- 현재 elapsed time 추적
- timeline event 실행
- active AoE 상태 관리
- 판정 결과 관리
- 모든 클라이언트에 mechanic state sync

권장 상태:

```ts
type ActiveMechanicState = {
  mechanicId: string;
  startedAt: number;
  elapsed: number;
  activeAoes: Record<string, ActiveAoe>;
  markers: Record<string, PlayerMarker>;
  results: MechanicResult[];
};
```

## 클라이언트 구현 방향

클라이언트는 서버 state만 렌더링한다.

- active AoE 렌더링
- player marker 렌더링
- message 표시
- 판정 결과 표시

클라이언트가 기믹 판정을 직접 하지 않는다.

