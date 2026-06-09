# Missing Mechanic Simulator Worklog

## Scope

This document summarizes the implementation work for the current Missing mechanic simulator pass.

## Implemented Changes

- Added the initial `행방불명` boss cast sequence before debuffs appear.
- Added boss cast UI and progress bar for `행방불명`, `미래의 종언`, and `과거의 종언`.
- Added live-room start behavior where empty roles are filled by server-authoritative guide bots before the mechanic begins.
- Live-room start now uses random mechanic assignment rules instead of the scripted guide marker table.
- Added guide playback where the selected role is used as the camera focus and every role follows the scripted guide positions.
- Added a one-second hold after the first head markers appear before guide playback starts moving.
- Added pause/resume controls. Tower fill progress now follows mechanic elapsed time, so it pauses with the timeline.
- Added a failure-stop option that halts the mechanic immediately while preserving logs and visible failure ranges.
- Failure logs now identify whether the issue was on the boss-facing left tower or right tower.
- Updated tower geometry to 8m width and 8.5m distance from arena center.
- Updated head markers from text labels to shape-based indicators:
  - Spread: filled circular marker.
  - Cone: fan-shaped marker.
  - Share: center circle with inward arrows.
- Standardized marker color to a pale orange tone.
- Updated share attack radius to 4.5m and spread attack radius to 4m.
- Added one-second persistence for attack area indicators after damage resolution.
- Added clone bait and kick indicators for even tower follow-up handling.

## Position Tuning

- Odd tower inactive tank stands 4.3m from the left tower center and 8m from arena center.
- Odd tower left cone target stands inside the tower as close to the outer edge as possible.
- Odd tower left cone target was moved 0.1m further toward the tower center.
- Odd tower inactive dealer stands 4.3m from the right tower center and 6m from arena center.
- Odd tower inactive healer position was tuned around the left tower edge.
- Even tower cone, spread, tank, and melee positions were tuned using boss-facing left/right rules.
- Even tower cone targets were moved 0.1m further toward each tower center.
- Even tower inactive healers stand on the arena-center side of the 9 o'clock waymark when the space between towers is treated as 6 o'clock.
- Even tower inactive ranged dealers stand on the arena-center side of the 3 o'clock waymark when the space between towers is treated as 6 o'clock.

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
