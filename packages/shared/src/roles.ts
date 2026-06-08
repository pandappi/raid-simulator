export const PLAYER_ROLES = ["MT", "ST", "H1", "H2", "D1", "D2", "D3", "D4"] as const;

export type PlayerRole = (typeof PLAYER_ROLES)[number];

export function isPlayerRole(value: unknown): value is PlayerRole {
  return typeof value === "string" && PLAYER_ROLES.includes(value as PlayerRole);
}
