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
  /** File name (without extension) of the artwork in public/art. */
  art: string;
}

type SpecialSpec = [name: string, effect: SpecialCard["effect"], art: string, weather?: WeatherType];

const artPath = (slug: string): string => `/art/${slug}.webp`;

function build(prefix: string, specs: UnitSpec[], specials: SpecialSpec[]): Card[] {
  const units = specs.map(
    (spec, i): UnitCard => ({
      kind: "unit",
      id: `${prefix}u${i}`,
      name: spec.name,
      art: artPath(spec.art),
      basePower: spec.power,
      row: spec.row,
      isHero: spec.hero ?? false,
      abilities: spec.abilities ?? [],
      bondGroup: spec.bond,
      musterGroup: spec.muster,
    }),
  );
  const cards = specials.map(([name, effect, art, weather], i): SpecialCard => {
    const base = { kind: "special" as const, id: `${prefix}s${i}`, name, art: artPath(art) };
    return effect === "weather" ? { ...base, effect, weather: weather as WeatherType } : { ...base, effect };
  });
  return [...units, ...cards];
}

const valeUnits: UnitSpec[] = [
  { name: "Warden Captain Gawen", power: 10, row: "close", hero: true, art: "warden-captain" },
  { name: "Sage Orwen", power: 7, row: "ranged", hero: true, art: "sage-orwen" },
  { name: "Vale Pikeman", power: 4, row: "close", abilities: ["tightBond"], bond: "pike", art: "vale-pikeman" },
  { name: "Vale Pikeman", power: 4, row: "close", abilities: ["tightBond"], bond: "pike", art: "vale-pikeman" },
  { name: "Vale Pikeman", power: 4, row: "close", abilities: ["tightBond"], bond: "pike", art: "vale-pikeman" },
  { name: "Longbow Scout", power: 3, row: "ranged", abilities: ["tightBond"], bond: "bow", art: "longbow-scout" },
  { name: "Longbow Scout", power: 3, row: "ranged", abilities: ["tightBond"], bond: "bow", art: "longbow-scout" },
  { name: "Longbow Scout", power: 3, row: "ranged", abilities: ["tightBond"], bond: "bow", art: "longbow-scout" },
  { name: "Field Medic Brannoch", power: 3, row: "close", abilities: ["medic"], art: "medic-brannoch" },
  { name: "Field Medic Aoife", power: 3, row: "ranged", abilities: ["medic"], art: "medic-aoife" },
  { name: "Informant Kell", power: 5, row: "close", abilities: ["spy"], art: "informant-kell" },
  { name: "Informant Wren", power: 4, row: "ranged", abilities: ["spy"], art: "informant-wren" },
  { name: "Banner Squire", power: 2, row: "close", abilities: ["muster"], muster: "squire", art: "banner-squire" },
  { name: "Banner Squire", power: 2, row: "close", abilities: ["muster"], muster: "squire", art: "banner-squire" },
  { name: "Banner Squire", power: 2, row: "close", abilities: ["muster"], muster: "squire", art: "banner-squire" },
  { name: "Drummer Tobin", power: 2, row: "siege", abilities: ["horn"], art: "drummer-tobin" },
  { name: "Standard Bearer Lysa", power: 1, row: "close", abilities: ["moraleBoost"], art: "standard-bearer" },
  { name: "Skirmisher Dara", power: 5, row: "close", abilities: ["agile"], art: "skirmisher-dara" },
  { name: "Siege Engineer Holt", power: 6, row: "siege", art: "siege-engineer" },
  { name: "Ballista Crew", power: 5, row: "siege", art: "ballista-crew" },
  { name: "Pyromancer Veyra", power: 7, row: "close", abilities: ["scorch"], art: "pyromancer" },
  { name: "Pikeman Elder", power: 6, row: "close", art: "pikeman-elder" },
  { name: "Ranger Corin", power: 6, row: "ranged", art: "ranger-corin" },
  { name: "Bolt Thrower", power: 4, row: "siege", art: "bolt-thrower" },
];

const hollowUnits: UnitSpec[] = [
  { name: "Elder Wyrm", power: 10, row: "close", hero: true, art: "elder-wyrm" },
  { name: "Mire Witch Sorrel", power: 7, row: "ranged", hero: true, art: "mire-witch" },
  { name: "Bog Wolf", power: 4, row: "close", abilities: ["tightBond"], bond: "hound", art: "bog-wolf" },
  { name: "Bog Wolf", power: 4, row: "close", abilities: ["tightBond"], bond: "hound", art: "bog-wolf" },
  { name: "Bog Wolf", power: 4, row: "close", abilities: ["tightBond"], bond: "hound", art: "bog-wolf" },
  { name: "Spitter", power: 3, row: "ranged", abilities: ["tightBond"], bond: "spit", art: "spitter" },
  { name: "Spitter", power: 3, row: "ranged", abilities: ["tightBond"], bond: "spit", art: "spitter" },
  { name: "Spitter", power: 3, row: "ranged", abilities: ["tightBond"], bond: "spit", art: "spitter" },
  { name: "Grave Tender", power: 3, row: "close", abilities: ["medic"], art: "grave-tender" },
  { name: "Carrion Priest", power: 3, row: "ranged", abilities: ["medic"], art: "carrion-priest" },
  { name: "Whisperer", power: 5, row: "close", abilities: ["spy"], art: "whisperer" },
  { name: "Shade Courier", power: 4, row: "ranged", abilities: ["spy"], art: "shade-courier" },
  { name: "Ghoul Pup", power: 2, row: "close", abilities: ["muster"], muster: "ghoul", art: "ghoul-pup" },
  { name: "Ghoul Pup", power: 2, row: "close", abilities: ["muster"], muster: "ghoul", art: "ghoul-pup" },
  { name: "Ghoul Pup", power: 2, row: "close", abilities: ["muster"], muster: "ghoul", art: "ghoul-pup" },
  { name: "Howler", power: 2, row: "siege", abilities: ["horn"], art: "howler" },
  { name: "Frenzy Imp", power: 1, row: "close", abilities: ["moraleBoost"], art: "frenzy-imp" },
  { name: "Marsh Stalker", power: 5, row: "close", abilities: ["agile"], art: "marsh-stalker" },
  { name: "Rockhide Giant", power: 6, row: "siege", art: "rockhide-giant" },
  { name: "Boulder Thrower", power: 5, row: "siege", art: "boulder-thrower" },
  { name: "Ember Drake", power: 7, row: "close", abilities: ["scorch"], art: "ember-drake" },
  { name: "Cave Brute", power: 6, row: "close", art: "cave-brute" },
  { name: "Thorn Archer", power: 6, row: "ranged", art: "thorn-archer" },
  { name: "Hollow Catapult", power: 4, row: "siege", art: "hollow-catapult" },
];

const specials: SpecialSpec[] = [
  ["Rallying Horn", "horn", "rallying-horn"],
  ["Switchback", "decoy", "switchback"],
  ["Scorching Strike", "scorch", "scorching-strike"],
  ["Bitter Frost", "weather", "bitter-frost", "bitingFrost"],
  ["Clear Skies", "weather", "clear-skies", "clearWeather"],
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
