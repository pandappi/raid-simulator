# Missing Tower Position Rules

This document is the position source of truth for guide bots and guide playback.

## Common Rules

- Tower left/right is decided from the viewpoint of standing between the two towers and looking toward the boss.
- Each tower receives exactly two active tower players.
- There is no generic marker-to-tower default side. Each tower step defines its own required composition.
- Active players who stand near the tower edge should stand 0.3m inside the tower boundary for stable tower detection.
- Group 1 handles towers 1, 2, 3, and 8.
- Group 2 handles towers 4, 5, 6, and 7.
- When two players in one tower receive the same reassigned marker, compare their distance to arena center:
  - The player closer to arena center keeps priority for that tower direction.
  - The player farther from arena center gets priority for the opposite tower direction.

## Odd Towers

Active group composition:

- Share x2
- Cone x1
- Spread x1

Left tower:

- The higher-left-priority share target stands at the left tower center.
- The cone target stands inside the left tower at the point farthest from arena center.

Right tower:

- The higher-right-priority share target stands at the midpoint of the two intersections between the boss hitbox and the right tower.
- The spread target stands inside the right tower at the point farthest from the right share target.

Inactive group:

- Tanks stand between towers, outside and close to the left tower edge.
- Dealers stand between towers, outside and close to the right tower edge.
- Healers stand 0.9m outside the left tower edge to bait the cone outward while avoiding share damage.

## Even Towers

Active group composition:

- Cone x2
- Spread x2

Left tower:

- The cone target stands on the boss/tower intersection chosen as the boss-facing left contact.
- The spread target stands inside the left tower opposite the cone target.

Right tower:

- The cone target stands on the boss/tower intersection chosen as the boss-facing right contact.
- The spread target stands inside the right tower opposite the cone target.

Inactive group:

- Tanks stand at boss 11 o'clock when the space between towers is treated as 6 o'clock.
- Melee dealers stand at boss 1 o'clock when the space between towers is treated as 6 o'clock.
- Healers stand on the arena-center edge of the 9 o'clock floor marker.
- Ranged dealers stand on the arena-center edge of the 3 o'clock floor marker.

## Future/Past Bait

After even tower resolution, all eight players bait together.

- Past: move toward the next tower pair midpoint.
- Future: move opposite the next tower pair midpoint.
- Bait distance is 7m from arena center, with small role offsets.
