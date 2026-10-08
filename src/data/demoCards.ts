import type { NewGameOptions } from "../engine/game";
import type { Ability, Card, Faction, Leader, RowName, SpecialCard, UnitCard, WeatherType } from "../engine/types";

/**
 * Two hand-built demo decks. The names, numbers and art-free cards are
 * placeholders of my own (not taken from any game) so the engine can be played
 * before the final card set exists.
 */

interface UnitSpec {
  name: string;
  power: number;
  row: RowName;
  hero?: boolean;
  abilities?: Ability[];
  bond?: string;
  muster?: string;
}

function build(prefix: string, specs: UnitSpec[], specials: [string, SpecialCard["effect"], WeatherType?][]): Card[] {
  const units = specs.map(
    (spec, i): UnitCard => ({
      kind: "unit",
      id: `${prefix}u${i}`,
      name: spec.name,
      basePower: spec.power,
      row: spec.row,
      isHero: spec.hero ?? false,
      abilities: spec.abilities ?? [],
      bondGroup: spec.bond,
      musterGroup: spec.muster,
    }),
  );
  const cards = specials.map(([name, effect, weather], i): SpecialCard => {
    const base = { kind: "special" as const, id: `${prefix}s${i}`, name };
    return effect === "weather" ? { ...base, effect, weather: weather as WeatherType } : { ...base, effect };
  });
  return [...units, ...cards];
}

const valeUnits: UnitSpec[] = [
  { name: "Warden Captain Isolde", power: 10, row: "close", hero: true },
  { name: "Sage Orwen", power: 7, row: "ranged", hero: true },
  { name: "Vale Pikeman", power: 4, row: "close", abilities: ["tightBond"], bond: "pike" },
  { name: "Vale Pikeman", power: 4, row: "close", abilities: ["tightBond"], bond: "pike" },
  { name: "Vale Pikeman", power: 4, row: "close", abilities: ["tightBond"], bond: "pike" },
  { name: "Crossbow Scout", power: 3, row: "ranged", abilities: ["tightBond"], bond: "bow" },
  { name: "Crossbow Scout", power: 3, row: "ranged", abilities: ["tightBond"], bond: "bow" },
  { name: "Crossbow Scout", power: 3, row: "ranged", abilities: ["tightBond"], bond: "bow" },
  { name: "Field Medic Brannoch", power: 3, row: "close", abilities: ["medic"] },
  { name: "Field Medic Aoife", power: 3, row: "ranged", abilities: ["medic"] },
  { name: "Informant Kell", power: 5, row: "close", abilities: ["spy"] },
  { name: "Informant Wren", power: 4, row: "ranged", abilities: ["spy"] },
  { name: "Banner Squire", power: 2, row: "close", abilities: ["muster"], muster: "squire" },
  { name: "Banner Squire", power: 2, row: "close", abilities: ["muster"], muster: "squire" },
  { name: "Banner Squire", power: 2, row: "close", abilities: ["muster"], muster: "squire" },
  { name: "Drummer Tobin", power: 2, row: "siege", abilities: ["horn"] },
  { name: "Standard Bearer Lysa", power: 1, row: "close", abilities: ["moraleBoost"] },
  { name: "Skirmisher Dara", power: 5, row: "close", abilities: ["agile"] },
  { name: "Siege Engineer Holt", power: 6, row: "siege" },
  { name: "Catapult Crew", power: 5, row: "siege" },
  { name: "Pyromancer Veyra", power: 7, row: "close", abilities: ["scorch"] },
  { name: "Pikeman Elder", power: 6, row: "close" },
  { name: "Ranger Corin", power: 6, row: "ranged" },
  { name: "Bolt Thrower", power: 4, row: "siege" },
];

const hollowUnits: UnitSpec[] = [
  { name: "Elder Wyrm", power: 10, row: "close", hero: true },
  { name: "Mire Witch Sorrel", power: 7, row: "ranged", hero: true },
  { name: "Bog Hound", power: 4, row: "close", abilities: ["tightBond"], bond: "hound" },
  { name: "Bog Hound", power: 4, row: "close", abilities: ["tightBond"], bond: "hound" },
  { name: "Bog Hound", power: 4, row: "close", abilities: ["tightBond"], bond: "hound" },
  { name: "Spitter", power: 3, row: "ranged", abilities: ["tightBond"], bond: "spit" },
  { name: "Spitter", power: 3, row: "ranged", abilities: ["tightBond"], bond: "spit" },
  { name: "Spitter", power: 3, row: "ranged", abilities: ["tightBond"], bond: "spit" },
  { name: "Grave Tender", power: 3, row: "close", abilities: ["medic"] },
  { name: "Carrion Priest", power: 3, row: "ranged", abilities: ["medic"] },
  { name: "Whisperer", power: 5, row: "close", abilities: ["spy"] },
  { name: "Shade Courier", power: 4, row: "ranged", abilities: ["spy"] },
  { name: "Ghoul Pup", power: 2, row: "close", abilities: ["muster"], muster: "ghoul" },
  { name: "Ghoul Pup", power: 2, row: "close", abilities: ["muster"], muster: "ghoul" },
  { name: "Ghoul Pup", power: 2, row: "close", abilities: ["muster"], muster: "ghoul" },
  { name: "Howler", power: 2, row: "siege", abilities: ["horn"] },
  { name: "Frenzy Imp", power: 1, row: "close", abilities: ["moraleBoost"] },
  { name: "Marsh Stalker", power: 5, row: "close", abilities: ["agile"] },
  { name: "Rockhide Giant", power: 6, row: "siege" },
  { name: "Boulder Thrower", power: 5, row: "siege" },
  { name: "Ember Drake", power: 7, row: "close", abilities: ["scorch"] },
  { name: "Cave Brute", power: 6, row: "close" },
  { name: "Thorn Archer", power: 6, row: "ranged" },
  { name: "Hollow Catapult", power: 4, row: "siege" },
];

const specials: [string, SpecialCard["effect"], WeatherType?][] = [
  ["Rallying Horn", "horn"],
  ["Switchback", "decoy"],
  ["Scorching Strike", "scorch"],
  ["Bitter Frost", "weather", "bitingFrost"],
  ["Clear Skies", "weather", "clearWeather"],
];

const valeLeader: Leader = { id: "vale-leader", name: "Marshal of the Vale", effect: { type: "horn", row: "siege" } };
const hollowLeader: Leader = { id: "hollow-leader", name: "The Hollow King", effect: { type: "scorchRow", row: "close" } };

export interface DemoSetup {
  decks: [Card[], Card[]];
  /** Pass straight into `newGame` with `{ decks, rng, ...options }`. */
  options: Required<Pick<NewGameOptions, "factions" | "leaders" | "validateDecks">>;
}

/** The player's deck is first, the opponent's second. */
export function demoDecks(): DemoSetup {
  const factions: [Faction, Faction] = ["northernRealms", "monsters"];
  return {
    decks: [build("p0-", valeUnits, specials), build("p1-", hollowUnits, specials)],
    options: { factions, leaders: [valeLeader, hollowLeader], validateDecks: true },
  };
}
