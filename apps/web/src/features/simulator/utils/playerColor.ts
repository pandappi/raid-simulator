import type { PlayerRole } from "@raid-simulator/shared";

const ROLE_COLORS: Record<PlayerRole, string> = {
  MT: "#2f80ed",
  ST: "#2f80ed",
  H1: "#22a06b",
  H2: "#22a06b",
  D1: "#e5484d",
  D2: "#e5484d",
  D3: "#e5484d",
  D4: "#e5484d"
};

export function getPlayerColor(role: PlayerRole, isSelf: boolean) {
  return isSelf ? "#ffd400" : ROLE_COLORS[role];
}
