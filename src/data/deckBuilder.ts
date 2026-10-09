import { describeDeckError, validateDeck } from "../engine/deck";
import type { Faction } from "../engine/types";
import type { CatalogEntry } from "./catalog";
import { collectionFor, leadersFor, starterEntries, toCard } from "./decks";

export interface BuilderStats {
  cards: number;
  units: number;
  specials: number;
  heroes: number;
  /** Sum of the printed strengths of the unit cards. */
  strength: number;
}

export function builderStats(entries: readonly CatalogEntry[]): BuilderStats {
  const stats: BuilderStats = { cards: entries.length, units: 0, specials: 0, heroes: 0, strength: 0 };
  for (const e of entries) {
    if (e.kind === "unit") {
      stats.units += 1;
      stats.strength += e.strength ?? 0;
      if (e.hero) stats.heroes += 1;
    } else {
      stats.specials += 1;
    }
  }
  return stats;
}

export interface BuilderCheck {
  valid: boolean;
  /** One readable line per broken rule. */
  problems: string[];
  stats: BuilderStats;
}

/** Checks a deck against the engine's deck-building rules, plus having a leader to lead it. */
export function checkDeck(faction: Faction, leaderId: string | undefined, entries: readonly CatalogEntry[]): BuilderCheck {
  const leader = leadersFor(faction).find((l) => l.id === leaderId) ?? null;
  const result = validateDeck(entries.map((e) => toCard(e, "check-")), faction, leader);
  return { valid: result.valid, problems: result.errors.map(describeDeckError), stats: builderStats(entries) };
}

const KIND_ORDER = { unit: 0, special: 1, weather: 2, leader: 3 } as const;

/** Heroes first, then strongest first, then by name; specials and weather after the units. */
export function sortEntries(entries: readonly CatalogEntry[]): CatalogEntry[] {
  return [...entries].sort(
    (a, b) =>
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      Number(b.hero === true) - Number(a.hero === true) ||
      (b.strength ?? 0) - (a.strength ?? 0) ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id),
  );
}

export interface CardGroup {
  name: string;
  /** Every copy of the card, in a stable order. */
  entries: CatalogEntry[];
}

/** Gathers the copies of each card (they share a name) into one group, in display order. */
export function groupByName(entries: readonly CatalogEntry[]): CardGroup[] {
  const groups = new Map<string, CardGroup>();
  for (const e of sortEntries(entries)) {
    const group = groups.get(e.name) ?? { name: e.name, entries: [] };
    group.entries.push(e);
    groups.set(e.name, group);
  }
  return [...groups.values()];
}

export const starterIds = (faction: Faction): string[] => starterEntries(faction).map((e) => e.id);

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && [...a].sort().every((id, i) => id === [...b].sort()[i]);

// ---- saving your deck in the browser ----

const key = (faction: Faction): string => `gwent-online:deck:${faction}`;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Saves your deck for a faction. Saving the starter deck clears the saved one. */
export function saveDeck(faction: Faction, ids: readonly string[]): void {
  const store = storage();
  if (!store) return;
  try {
    if (sameSet(ids, starterIds(faction))) store.removeItem(key(faction));
    else store.setItem(key(faction), JSON.stringify(ids));
  } catch {
    // Private windows and full storage can refuse writes; the deck just will not be remembered.
  }
}

export function clearSavedDeck(faction: Faction): void {
  try {
    storage()?.removeItem(key(faction));
  } catch {
    // nothing to clear
  }
}

/**
 * Your saved deck for a faction, or null when there is none or it no longer holds up
 * (cards removed from the game, or the rules no longer pass).
 */
export function loadSavedDeck(faction: Faction): string[] | null {
  let raw: string | null = null;
  try {
    raw = storage()?.getItem(key(faction)) ?? null;
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.some((id) => typeof id !== "string")) return null;
    const allowed = new Map(collectionFor(faction).map((e) => [e.id, e]));
    const ids = (parsed as string[]).filter((id, i, all) => allowed.has(id) && all.indexOf(id) === i);
    const entries = ids.map((id) => allowed.get(id) as CatalogEntry);
    const leader = leadersFor(faction)[0];
    return checkDeck(faction, leader?.id, entries).valid ? ids : null;
  } catch {
    return null;
  }
}
