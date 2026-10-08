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
  kind: "unit";
  id: string;
  name: string;
  /** Printed strength before any effects. */
  basePower: number;
  /** The row this card is played to. */
  row: RowName;
  /** Heroes ignore weather, horn, bond and morale, and cannot be scorched or decoyed. */
  isHero: boolean;
  abilities: Ability[];
  /** Units that share a bond group multiply each other under tight bond. */
  bondGroup?: string;
}

export type WeatherType =
  | "bitingFrost"
  | "impenetrableFog"
  | "torrentialRain"
  | "skelligeStorm"
  | "clearWeather";

/** Which rows (on both sides) each weather card affects. Clear Weather affects none. */
export const WEATHER_ROWS: Record<WeatherType, RowName[]> = {
  bitingFrost: ["close"],
  impenetrableFog: ["ranged"],
  torrentialRain: ["siege"],
  skelligeStorm: ["ranged", "siege"],
  clearWeather: [],
};

export type SpecialCard = {
  kind: "special";
  id: string;
  name: string;
} & (
  | { effect: "weather"; weather: WeatherType }
  | { effect: "horn" }
  | { effect: "decoy" }
  | { effect: "scorch" }
);

export type Card = UnitCard | SpecialCard;

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
