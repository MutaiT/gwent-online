import type { NewGameOptions } from "../engine/game";
import { validateDeck } from "../engine/deck";
import type { Card, Faction, Leader, SpecialCard, UnitCard } from "../engine/types";
import { CATALOG, type CatalogEntry } from "./catalog";

export interface FactionInfo {
  id: Faction;
  name: string;
  /** What the faction's passive ability does. */
  ability: string;
}

export const FACTIONS: FactionInfo[] = [
  { id: "northernRealms", name: "Northern Realms", ability: "Draw a card from your deck whenever you win a round." },
  { id: "nilfgaard", name: "Nilfgaardian Empire", ability: "Wins any round that ends in a draw." },
  { id: "scoiatael", name: "Scoia'tael", ability: "You decide who takes the first turn." },
  { id: "monsters", name: "Monsters", ability: "Keeps a random unit on the board after each round." },
  { id: "skellige", name: "Skellige", ability: "Two random units return from the graveyard at the start of round 3." },
];

export const factionInfo = (id: Faction): FactionInfo => FACTIONS.find((f) => f.id === id) as FactionInfo;

/** Neutral cards every starter deck includes. */
const NEUTRAL_UNITS = [
  "Geralt of Rivia",
  "Yennefer of Vengerberg",
  "Triss Merigold",
  "Dandelion",
  "Villentretenmerth",
  "Vesemir",
  "Zoltan Chivay",
  "Emiel Regis Rohellec Terzieff",
];

/** Special and weather cards every starter deck includes, as [name or kind, how many]. */
const STARTER_SPECIALS: [kind: "horn" | "decoy" | "scorch", copies: number][] = [
  ["horn", 1],
  ["decoy", 2],
  ["scorch", 1],
];
const STARTER_WEATHER = ["bitingFrost", "impenetrableFog", "torrentialRain", "clearWeather"] as const;

export function toCard(entry: CatalogEntry, prefix: string): Card {
  const id = prefix + entry.id;
  if (entry.kind === "unit") {
    const unit: UnitCard = {
      kind: "unit",
      id,
      name: entry.name,
      art: entry.art,
      officialFace: true,
      basePower: entry.strength as number,
      row: entry.row as UnitCard["row"],
      isHero: entry.hero === true,
      abilities: entry.abilities ?? [],
      bondGroup: entry.bond,
      musterGroup: entry.muster,
      faction: entry.faction === "neutral" ? undefined : entry.faction,
    };
    return unit;
  }
  const base = { kind: "special" as const, id, name: entry.name, art: entry.art, officialFace: true };
  if (entry.kind === "weather") {
    return { ...base, effect: "weather", weather: entry.weather as NonNullable<CatalogEntry["weather"]> } satisfies SpecialCard;
  }
  return { ...base, effect: entry.special as NonNullable<CatalogEntry["special"]> } satisfies SpecialCard;
}

const usable = (e: CatalogEntry): boolean => e.unsupported === undefined;

/** The leaders a faction can use today. */
export function leadersFor(faction: Faction): Leader[] {
  return CATALOG.filter((e) => e.kind === "leader" && e.faction === faction && e.effect && usable(e)).map((e) => ({
    id: e.id,
    name: e.name,
    art: e.art,
    officialFace: true,
    effect: e.effect as NonNullable<CatalogEntry["effect"]>,
    faction,
  }));
}

/** Leaders that exist but are not playable yet, for showing as unavailable. */
export function unavailableLeaders(faction: Faction): { id: string; name: string; reason: string }[] {
  return CATALOG.filter((e) => e.kind === "leader" && e.faction === faction && !usable(e)).map((e) => ({
    id: e.id,
    name: e.name,
    reason: e.unsupported as string,
  }));
}

/** A face for the faction, for menus: its first leader's card. */
export function factionPortrait(faction: Faction): string {
  return (CATALOG.find((e) => e.kind === "leader" && e.faction === faction) as CatalogEntry).art;
}

/**
 * Every card a faction may put in a deck: its own units, the neutral units, and the
 * special and weather cards, minus the ones the engine cannot play yet. Each copy is
 * its own entry (they have different pictures).
 */
export function collectionFor(faction: Faction): CatalogEntry[] {
  return CATALOG.filter(
    (e) => e.kind !== "leader" && usable(e) && (e.faction === faction || e.faction === "neutral"),
  );
}

/** How many of a faction's own units the starter deck holds (the neutral units come on top). */
const STARTER_FACTION_UNITS = 26;

/**
 * The cards of the ready-made deck for a faction: its heroes, its cards with abilities and its
 * strongest plain units, kept together with all their copies, up to about 26 units; then a few
 * neutral units, and some special and weather cards.
 */
export function starterEntries(faction: Faction): CatalogEntry[] {
  const own = CATALOG.filter((e) => e.kind === "unit" && e.faction === faction && usable(e));
  const families = new Map<string, CatalogEntry[]>();
  for (const e of own) families.set(e.name, [...(families.get(e.name) ?? []), e]);
  const rank = (family: CatalogEntry[]): number => {
    const first = family[0] as CatalogEntry;
    return first.hero ? 2 : (first.abilities?.length ?? 0) > 0 ? 1 : 0;
  };
  const ordered = [...families.values()].sort(
    (a, b) => rank(b) - rank(a) || (b[0]?.strength ?? 0) - (a[0]?.strength ?? 0) || (a[0]?.name ?? "").localeCompare(b[0]?.name ?? ""),
  );
  const factionUnits: CatalogEntry[] = [];
  for (const family of ordered) {
    if (factionUnits.length + family.length <= STARTER_FACTION_UNITS) factionUnits.push(...family);
  }
  const neutrals = NEUTRAL_UNITS.flatMap((name) =>
    CATALOG.filter((e) => e.kind === "unit" && e.faction === "neutral" && e.name === name && usable(e)).slice(0, 1),
  );
  const specials = STARTER_SPECIALS.flatMap(([kind, copies]) =>
    CATALOG.filter((e) => e.kind === "special" && e.special === kind).slice(0, copies),
  );
  const weather = STARTER_WEATHER.flatMap((w) =>
    CATALOG.filter((e) => e.kind === "weather" && e.weather === w).slice(0, 1),
  );
  return [...factionUnits, ...neutrals, ...specials, ...weather];
}

/**
 * A ready-made deck for a faction: all of its usable units, a handful of
 * neutral heroes and units, and a few special and weather cards.
 * `prefix` keeps card ids unique when both players use the same faction.
 */
export function starterDeck(faction: Faction, prefix: string): Card[] {
  return starterEntries(faction).map((e) => toCard(e, prefix));
}

export interface MatchSetup {
  player: Faction;
  opponent: Faction;
  /** Leader ids. Leave out to use the faction's first usable leader. */
  playerLeader?: string;
  opponentLeader?: string;
  /**
   * Catalogue ids of your own deck. Leave out for the starter deck. A deck that breaks the
   * deck-building rules, or has cards the faction may not use, is ignored in favour of the starter.
   */
  playerDeck?: string[];
}

export const DEFAULT_SETUP: MatchSetup = {
  player: "northernRealms",
  opponent: "monsters",
  playerLeader: "nr-foltest-the-siegemaster",
  opponentLeader: "mo-eredin-commander-of-the-red-riders",
};

export interface Match {
  decks: [Card[], Card[]];
  options: Required<Pick<NewGameOptions, "factions" | "leaders" | "validateDecks">>;
}

function chooseLeader(faction: Faction, id?: string): Leader {
  const options = leadersFor(faction);
  const found = id === undefined ? undefined : options.find((l) => l.id === id);
  return found ?? (options[0] as Leader);
}

/** Turns catalogue ids into cards, or null if any id is unknown, repeated, or not allowed for the faction. */
export function deckFromIds(faction: Faction, ids: readonly string[], prefix: string): Card[] | null {
  const allowed = new Map(collectionFor(faction).map((e) => [e.id, e]));
  if (new Set(ids).size !== ids.length) return null;
  const entries = ids.map((id) => allowed.get(id));
  if (entries.some((e) => e === undefined)) return null;
  return (entries as CatalogEntry[]).map((e) => toCard(e, prefix));
}

export function buildMatch(setup: MatchSetup = DEFAULT_SETUP): Match {
  const leaders: [Leader, Leader] = [
    chooseLeader(setup.player, setup.playerLeader),
    chooseLeader(setup.opponent, setup.opponentLeader),
  ];
  const custom = setup.playerDeck ? deckFromIds(setup.player, setup.playerDeck, "p0-") : null;
  const mine = custom && validateDeck(custom, setup.player, leaders[0]).valid ? custom : starterDeck(setup.player, "p0-");
  return {
    decks: [mine, starterDeck(setup.opponent, "p1-")],
    options: { factions: [setup.player, setup.opponent], leaders, validateDecks: true },
  };
}
