# Missing Mechanic Simulator Worklog

## Scope

This document summarizes the implementation work for the current Missing mechanic simulator pass.

## Implemented Changes

- Added the initial `행방불명` boss cast sequence before debuffs appear.
- Added boss cast UI and progress bar for `행방불명`, `미래의 종언`, and `과거의 종언`.
- Updated tower geometry to 6m width and 6m distance from arena center.
- Updated head markers from text labels to shape-based indicators:
  - Spread: filled circular marker.
  - Cone: fan-shaped marker.
  - Share: center circle with inward arrows.
- Standardized marker color to a pale orange tone.
- Updated share attack radius to 3.4m.
- Added one-second persistence for attack area indicators after damage resolution.
- Added clone bait and kick indicators for even tower follow-up handling.

## Scripted Strategy Mode

- Added a frontend-only scripted guide playback.
- Added `봇 보충 시작` for live rooms:
  - Missing roles are filled with bots.
  - Human and bot roles are normalized to the assumed start formation:

```text
MT ST D1 D2
H1 H2 D3 D4
```

- The scripted pattern uses the fixed initial example:
  - Group 1: `MT`, `H1`, `D2`, `D4`
  - Group 2: `ST`, `H2`, `D1`, `D3`
- Group 1 handles towers 1, 2, 3, and 8.
- Group 2 handles towers 4, 5, 6, and 7.
- Debuff reassignment display now follows tower-resolution timing:
  - Tower 4 uses Group 2's initial debuffs.
  - After tower 3, only Group 1's reassigned debuffs are shown.
  - After tower 7, no reassigned debuffs are shown.

## Bot Movement

- Bots no longer move before the first debuff assignment.
- Bots wander smoothly after debuffs are assigned instead of snapping between random targets.
- Bots move into tower mechanic positions in time for the tower lock window.
- Even-tower future/past bait movement was added:
  - `과거의 종언`: bait toward the next tower pair midpoint.
  - `미래의 종언`: bait opposite the next tower pair midpoint.
- Bot positioning uses the role's current debuff state rather than a hard-coded round-only table.

## Position Tuning

- Odd tower inactive tank stands just outside the left tower edge.
- Odd tower left cone target stands inside the tower as close to the outer edge as possible.
- Odd tower inactive dealer and healer positions were tuned around tower edges.
- Even tower cone, spread, healer, ranged, tank, and melee positions were tuned using boss-facing left/right rules.

## Camera

- Camera target now follows the controlled player instead of staying fixed on arena center.
- Orbit rotation and zoom behavior are preserved.

## Validation

The following commands were used during the final pass:

```bash
pnpm --filter server typecheck
pnpm --filter server build
pnpm --filter web typecheck
pnpm --filter web build
```

