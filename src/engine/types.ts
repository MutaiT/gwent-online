export type RowName = "close" | "ranged" | "siege";

export type Ability =
  | "tightBond"
  | "moraleBoost"
  | "horn"
  | "spy"
  | "medic"
  | "muster"
  | "scorch";

export interface UnitCard {
  id: string;
  name: string;
  /** Printed strength before any effects. */
  basePower: number;
  /** The row this card is played to. */
  row: RowName;
  /** Heroes ignore weather, horn, bond and morale. */
  isHero: boolean;
  abilities: Ability[];
  /** Units that share a bond group multiply each other under tight bond. */
  bondGroup?: string;
}

/** One of a player's three rows on the board. */
export interface RowState {
  units: UnitCard[];
  /** A weather card is currently affecting this row. */
  weather: boolean;
  /** A Commander's Horn special card (or leader horn) is on this row. */
  hornCard: boolean;
}

export type Board = Record<RowName, RowState>;

export function emptyRow(): RowState {
  return { units: [], weather: false, hornCard: false };
}

export function emptyBoard(): Board {
  return { close: emptyRow(), ranged: emptyRow(), siege: emptyRow() };
}
