import { describe, expect, it } from "vitest";
import { MAX_SPECIAL_CARDS, MIN_UNIT_CARDS, describeDeckError, validateDeck } from "./deck";
import { newGame } from "./game";
import { seededRng } from "./rng";
import type { Card, Faction, Leader, SpecialCard, UnitCard } from "./types";

function unit(id: string, basePower = 4, opts: { hero?: boolean; faction?: Faction } = {}): UnitCard {
  return {
    kind: "unit",
    id,
    name: id,
    basePower,
    row: "close",
    isHero: opts.hero ?? false,
    abilities: [],
    faction: opts.faction,
  };
}
const special = (id: string): SpecialCard => ({ kind: "special", id, name: id, effect: "scorch" });
const leader = (faction?: Faction): Leader => ({
  id: "lead",
  name: "Leader",
  effect: { type: "horn", row: "siege" },
  faction,
});

const units = (n: number, prefix = "u", opts: { faction?: Faction } = {}): Card[] =>
  Array.from({ length: n }, (_, i) => unit(`${prefix}${i}`, 4, opts));
const specials = (n: number): Card[] => Array.from({ length: n }, (_, i) => special(`s${i}`));

const codes = (cards: readonly Card[], faction: Faction, l: Leader | null = leader(), options = {}) =>
  validateDeck(cards, faction, l, options).errors.map((e) => e.code);

describe("deck size", () => {
  it("accepts the smallest legal deck", () => {
    const result = validateDeck(units(MIN_UNIT_CARDS), "nilfgaard", leader());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("accepts the maximum number of special cards", () => {
    expect(validateDeck([...units(25), ...specials(MAX_SPECIAL_CARDS)], "nilfgaard", leader()).valid).toBe(true);
  });

  it("rejects too few units, and reports the counts", () => {
    const result = validateDeck(units(MIN_UNIT_CARDS - 1), "nilfgaard", leader());
    expect(result.errors).toEqual([{ code: "tooFewUnits", min: 22, actual: 21 }]);
  });

  it("special cards do not count towards the unit minimum", () => {
    expect(codes([...units(15), ...specials(10)], "nilfgaard")).toEqual(["tooFewUnits"]);
  });

  it("rejects too many special cards", () => {
    const result = validateDeck([...units(25), ...specials(11)], "nilfgaard", leader());
    expect(result.errors).toEqual([{ code: "tooManySpecials", max: 10, actual: 11 }]);
  });

  it("an empty deck fails on units only", () => {
    expect(codes([], "nilfgaard")).toEqual(["tooFewUnits"]);
  });
});

describe("stats", () => {
  it("counts units, specials, heroes and total strength; heroes count as units", () => {
    const deck: Card[] = [unit("a", 5), unit("b", 7), unit("h", 10, { hero: true }), special("s1"), special("s2")];
    expect(validateDeck(deck, "monsters", leader()).stats).toEqual({
      units: 3,
      specials: 2,
      heroes: 1,
      totalStrength: 22,
    });
  });

  it("are reported even when the deck is invalid", () => {
    expect(validateDeck(units(3), "monsters", null).stats.units).toBe(3);
  });
});

describe("factions", () => {
  it("allows own-faction and neutral units", () => {
    const deck = [...units(11, "own", { faction: "skellige" }), ...units(11, "neutral")];
    expect(validateDeck(deck, "skellige", leader()).valid).toBe(true);
  });

  it("rejects a unit from another faction and names it", () => {
    const deck = [...units(22), unit("intruder", 6, { faction: "monsters" })];
    const result = validateDeck(deck, "skellige", leader());
    expect(result.errors).toEqual([
      { code: "wrongFaction", cardId: "intruder", cardFaction: "monsters", deckFaction: "skellige" },
    ]);
  });

  it("reports every wrong-faction card", () => {
    const deck = [...units(22), unit("x1", 4, { faction: "monsters" }), unit("x2", 4, { faction: "nilfgaard" })];
    expect(codes(deck, "skellige")).toEqual(["wrongFaction", "wrongFaction"]);
  });

  it("special cards are never faction restricted", () => {
    expect(validateDeck([...units(22), ...specials(3)], "scoiatael", leader()).valid).toBe(true);
  });
});

describe("duplicates", () => {
  it("rejects two cards with the same id, once per id", () => {
    const deck = [...units(22), unit("u0"), unit("u0"), special("s0"), special("s0")];
    const result = validateDeck(deck, "nilfgaard", leader());
    expect(result.errors).toEqual([
      { code: "duplicateId", cardId: "u0" },
      { code: "duplicateId", cardId: "s0" },
    ]);
  });
});

describe("leader", () => {
  it("is required by default", () => {
    expect(codes(units(22), "nilfgaard", null)).toEqual(["missingLeader"]);
  });

  it("is optional when requireLeader is false", () => {
    expect(validateDeck(units(22), "nilfgaard", null, { requireLeader: false }).valid).toBe(true);
  });

  it("must match the deck's faction", () => {
    const result = validateDeck(units(22), "nilfgaard", leader("monsters"));
    expect(result.errors).toEqual([
      { code: "leaderWrongFaction", leaderId: "lead", leaderFaction: "monsters", deckFaction: "nilfgaard" },
    ]);
  });

  it("a leader with no faction fits any deck", () => {
    expect(validateDeck(units(22), "nilfgaard", leader(undefined)).valid).toBe(true);
  });

  it("a matching leader is accepted", () => {
    expect(validateDeck(units(22), "monsters", leader("monsters")).valid).toBe(true);
  });
});

describe("several problems at once", () => {
  it("are all reported together", () => {
    const deck = [...units(5), unit("far", 3, { faction: "monsters" }), ...specials(12)];
    expect(codes(deck, "skellige", null)).toEqual(["wrongFaction", "tooFewUnits", "tooManySpecials", "missingLeader"]);
  });

  it("each error has a readable description", () => {
    const deck = [...units(5), unit("far", 3, { faction: "monsters" }), ...specials(12), unit("u0")];
    const result = validateDeck(deck, "skellige", leader("monsters"));
    expect(result.errors.length).toBeGreaterThan(4);
    for (const error of result.errors) expect(describeDeckError(error)).toMatch(/\w+/);
    expect(describeDeckError({ code: "tooFewUnits", min: 22, actual: 5 })).toBe("Needs at least 22 unit cards, has 5");
  });
});

describe("starting a game with validation", () => {
  const legal = (p: string): Card[] => [...units(22, p), ...specials(4).map((c) => ({ ...c, id: `${p}${c.id}` }))];

  it("is off by default, so small decks still work", () => {
    expect(() => newGame({ decks: [units(12, "a"), units(12, "b")], firstPlayer: 0, rng: seededRng(1) })).not.toThrow();
  });

  it("starts a game from two legal decks", () => {
    const g = newGame({
      decks: [legal("a"), legal("b")],
      firstPlayer: 0,
      rng: seededRng(1),
      factions: ["nilfgaard", "monsters"],
      leaders: [leader("nilfgaard"), leader("monsters")],
      validateDecks: true,
    });
    expect(g.players[0].hand).toHaveLength(10);
  });

  it("throws and explains when a deck is illegal", () => {
    expect(() =>
      newGame({
        decks: [legal("a"), units(12, "b")],
        firstPlayer: 0,
        rng: seededRng(1),
        factions: ["nilfgaard", "monsters"],
        leaders: [leader("nilfgaard"), leader("monsters")],
        validateDecks: true,
      }),
    ).toThrow(/Player 1's deck is not valid: Needs at least 22 unit cards, has 12/);
  });

  it("needs a faction to validate", () => {
    expect(() =>
      newGame({ decks: [legal("a"), legal("b")], firstPlayer: 0, rng: seededRng(1), validateDecks: true }),
    ).toThrow(/needs a faction/);
  });
});
