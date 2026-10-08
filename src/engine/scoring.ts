import type { Board, RowName, RowState, UnitCard } from "./types";

const ROWS: RowName[] = ["close", "ranged", "siege"];

/**
 * Current strength of one unit in its row.
 *
 * Order of effects: weather sets a unit's strength to 1, then tight bond
 * multiplies it, then morale boost adds, then horn doubles the result.
 * Heroes are never changed.
 */
export function unitPower(row: RowState, unit: UnitCard): number {
  if (unit.isHero) return unit.basePower;

  let power = row.weather ? 1 : unit.basePower;

  if (unit.abilities.includes("tightBond") && unit.bondGroup !== undefined) {
    const bonded = row.units.filter(
      (u) => u.abilities.includes("tightBond") && u.bondGroup === unit.bondGroup,
    ).length;
    power *= bonded;
  }

  // Each other morale-boost unit in the row adds 1 (a unit never boosts itself).
  // Heroes are immune to effects but still give them (Kayran, for example).
  const morale = row.units.filter((u) => u !== unit && u.abilities.includes("moraleBoost")).length;
  power += morale;

  // Horn doubles once, however many sources there are. A unit with the horn
  // ability does not double itself, but a horn card on the row does.
  const hornedByOther = row.units.some((u) => u !== unit && u.abilities.includes("horn"));
  if (row.hornCard || hornedByOther) power *= 2;

  return power;
}

export function rowPower(row: RowState): number {
  return row.units.reduce((sum, unit) => sum + unitPower(row, unit), 0);
}

export function boardPower(board: Board): number {
  return ROWS.reduce((sum, name) => sum + rowPower(board[name]), 0);
}
