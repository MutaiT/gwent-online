import type { Card, Faction, Leader } from "./types";

/** A deck needs at least this many unit cards (heroes count as units). */
export const MIN_UNIT_CARDS = 22;
/** A deck may hold at most this many special cards (weather, horn, decoy, scorch). */
export const MAX_SPECIAL_CARDS = 10;

export type DeckError =
  | { code: "tooFewUnits"; min: number; actual: number }
  | { code: "tooManySpecials"; max: number; actual: number }
  /** A unit belongs to a different faction. Neutral cards fit any deck. */
  | { code: "wrongFaction"; cardId: string; cardFaction: Faction; deckFaction: Faction }
  | { code: "duplicateId"; cardId: string }
  | { code: "missingLeader" }
  | { code: "leaderWrongFaction"; leaderId: string; leaderFaction: Faction; deckFaction: Faction };

export interface DeckStats {
  units: number;
  specials: number;
  heroes: number;
  /** Sum of the printed strengths of all unit cards. */
  totalStrength: number;
}

export interface DeckValidation {
  valid: boolean;
  errors: DeckError[];
  stats: DeckStats;
}

export interface ValidateDeckOptions {
  /** A leader is required unless this is false. Default true. */
  requireLeader?: boolean;
}

/**
 * Checks a deck against the deck-building rules and reports every problem,
 * not just the first.
 *
 *  - at least 22 unit cards and at most 10 special cards
 *  - every unit is from the deck's faction or neutral (specials are always neutral)
 *  - every card has a unique id
 *  - a leader from the deck's faction (or a neutral one)
 */
export function validateDeck(
  cards: readonly Card[],
  faction: Faction,
  leader: Leader | null,
  { requireLeader = true }: ValidateDeckOptions = {},
): DeckValidation {
  const errors: DeckError[] = [];
  const stats: DeckStats = { units: 0, specials: 0, heroes: 0, totalStrength: 0 };

  const seen = new Set<string>();
  const reportedDuplicates = new Set<string>();

  for (const card of cards) {
    if (seen.has(card.id) && !reportedDuplicates.has(card.id)) {
      errors.push({ code: "duplicateId", cardId: card.id });
      reportedDuplicates.add(card.id);
    }
    seen.add(card.id);

    if (card.kind === "special") {
      stats.specials += 1;
      continue;
    }

    stats.units += 1;
    stats.totalStrength += card.basePower;
    if (card.isHero) stats.heroes += 1;
    if (card.faction !== undefined && card.faction !== faction) {
      errors.push({ code: "wrongFaction", cardId: card.id, cardFaction: card.faction, deckFaction: faction });
    }
  }

  if (stats.units < MIN_UNIT_CARDS) {
    errors.push({ code: "tooFewUnits", min: MIN_UNIT_CARDS, actual: stats.units });
  }
  if (stats.specials > MAX_SPECIAL_CARDS) {
    errors.push({ code: "tooManySpecials", max: MAX_SPECIAL_CARDS, actual: stats.specials });
  }

  if (leader === null) {
    if (requireLeader) errors.push({ code: "missingLeader" });
  } else if (leader.faction !== undefined && leader.faction !== faction) {
    errors.push({
      code: "leaderWrongFaction",
      leaderId: leader.id,
      leaderFaction: leader.faction,
      deckFaction: faction,
    });
  }

  return { valid: errors.length === 0, errors, stats };
}

/** A short human-readable line for each error, for messages and the UI. */
export function describeDeckError(error: DeckError): string {
  switch (error.code) {
    case "tooFewUnits":
      return `Needs at least ${error.min} unit cards, has ${error.actual}`;
    case "tooManySpecials":
      return `Allows at most ${error.max} special cards, has ${error.actual}`;
    case "wrongFaction":
      return `Card ${error.cardId} belongs to ${error.cardFaction}, not ${error.deckFaction}`;
    case "duplicateId":
      return `Card id ${error.cardId} appears more than once`;
    case "missingLeader":
      return "Needs a leader";
    case "leaderWrongFaction":
      return `Leader ${error.leaderId} belongs to ${error.leaderFaction}, not ${error.deckFaction}`;
  }
}
