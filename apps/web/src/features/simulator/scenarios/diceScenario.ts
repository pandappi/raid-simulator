import {
  createDiceConfig,
  DICE_BOSS_RADIUS,
  DICE_TOTAL_MS,
  diceAttacks,
  diceBossPosition,
  diceLabel,
  diceRolePosition,
  diceVisibleAt,
  PLAYER_ROLES,
  type DiceAttack,
  type DiceConfig,
  type PlayerRole
} from "@raid-simulator/shared";

type Vec2 = { x: number; z: number };
export type DiceSample = {
  positions: Record<PlayerRole, Vec2>;
  attacks: DiceAttack[];
  diceByRole: Record<PlayerRole, number>;
  diceVisible: boolean;
  label: string;
  bossX: number;
  bossZ: number;
  bossRadius: number;
};

export { createDiceConfig, DICE_TOTAL_MS };
export type { DiceConfig };

// 공략보기(동선 보기)용: shared 로직을 한 번에 샘플링.
export function sampleDice(elapsedMs: number, config: DiceConfig): DiceSample {
  const positions = {} as Record<PlayerRole, Vec2>;
  for (const role of PLAYER_ROLES) {
    positions[role] = diceRolePosition(role, elapsedMs, config);
  }
  const boss = diceBossPosition(config);
  return {
    positions,
    attacks: diceAttacks(elapsedMs, config),
    diceByRole: config.diceByRole,
    diceVisible: diceVisibleAt(elapsedMs),
    label: diceLabel(elapsedMs),
    bossX: boss.x,
    bossZ: boss.z,
    bossRadius: DICE_BOSS_RADIUS
  };
}
