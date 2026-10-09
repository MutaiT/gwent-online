// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyAction, legalActions, newGame, type GameState } from "../engine/game";
import { seededRng } from "../engine/rng";
import type { Faction } from "../engine/types";
import { CATALOG, type CatalogEntry } from "./catalog";
import {
  builderStats,
  checkDeck,
  clearSavedDeck,
  groupByName,
  loadSavedDeck,
  saveDeck,
  sortEntries,
  starterIds,
} from "./deckBuilder";
import { FACTIONS, buildMatch, collectionFor, deckFromIds, leadersFor } from "./decks";

const ids = FACTIONS.map((f) => f.id);
const byId = (faction: Faction, list: readonly string[]): CatalogEntry[] => {
  const all = new Map(collectionFor(faction).map((e) => [e.id, e]));
  return list.map((id) => all.get(id) as CatalogEntry);
};

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe("the collection a faction can build from", () => {
  it.each(ids)("%s: only its own and neutral cards, no leaders, nothing unsupported", (faction) => {
    const collection = collectionFor(faction);
    expect(collection.length).toBeGreaterThan(40);
    for (const e of collection) {
      expect(e.kind).not.toBe("leader");
      expect(e.unsupported).toBeUndefined();
      expect(e.faction === faction || e.faction === "neutral", `${e.name} is ${e.faction}`).toBe(true);
    }
  });

  it("does not offer another faction's units", () => {
    expect(collectionFor("monsters").some((e) => e.name === "Vernon Roche")).toBe(false);
    expect(collectionFor("northernRealms").some((e) => e.name === "Vernon Roche")).toBe(true);
  });

  it("offers every faction the neutral heroes and the special and weather cards", () => {
    for (const f of ids) {
      const names = new Set(collectionFor(f).map((e) => e.name));
      for (const n of ["Geralt of Rivia", "Commander's Horn", "Decoy", "Scorch", "Biting Frost", "Clear Weather"]) {
        expect(names.has(n), `${f} lacks ${n}`).toBe(true);
      }
    }
  });

  it("leaves out cards the engine cannot play, such as Mardroeme and Berserkers", () => {
    const names = collectionFor("skellige").map((e) => e.name);
    expect(names).not.toContain("Berserker");
    expect(names).not.toContain("Cow");
  });

  it("every faction's starter deck is made of cards from its own collection and passes the rules", () => {
    for (const f of ids) {
      const all = new Set(collectionFor(f).map((e) => e.id));
      for (const id of starterIds(f)) expect(all.has(id)).toBe(true);
      expect(checkDeck(f, leadersFor(f)[0]!.id, byId(f, starterIds(f))).problems).toEqual([]);
    }
  });
});

describe("stats", () => {
  it("count cards, units, specials, heroes and strength", () => {
    const entries = [
      CATALOG.find((e) => e.name === "Geralt of Rivia")!,
      CATALOG.find((e) => e.name === "Dandelion")!,
      CATALOG.find((e) => e.name === "Scorch")!,
      CATALOG.find((e) => e.name === "Biting Frost")!,
    ];
    expect(builderStats(entries)).toEqual({ cards: 4, units: 2, specials: 2, heroes: 1, strength: 17 });
  });

  it("an empty deck is all zero", () => {
    expect(builderStats([])).toEqual({ cards: 0, units: 0, specials: 0, heroes: 0, strength: 0 });
  });
});

describe("checking a deck", () => {
  const faction: Faction = "nilfgaard";
  const leader = leadersFor(faction)[0]!.id;
  const starter = byId(faction, starterIds(faction));

  it("accepts the starter deck", () => {
    expect(checkDeck(faction, leader, starter)).toMatchObject({ valid: true, problems: [] });
  });

  it("explains a deck with too few units, and says how many it has", () => {
    const units = starter.filter((e) => e.kind === "unit");
    const check = checkDeck(faction, leader, units.slice(0, 15));
    expect(check.valid).toBe(false);
    expect(check.problems).toEqual(["Needs at least 22 unit cards, has 15"]);
  });

  it("explains a deck with too many special cards", () => {
    const units = starter.filter((e) => e.kind === "unit");
    const specials = collectionFor(faction).filter((e) => e.kind !== "unit").slice(0, 11);
    const check = checkDeck(faction, leader, [...units, ...specials]);
    expect(check.problems).toContain("Allows at most 10 special cards, has 11");
  });

  it("needs a leader", () => {
    expect(checkDeck(faction, undefined, starter).problems).toEqual(["Needs a leader"]);
  });

  it("special cards do not count as units, so a deck of 10 specials and 21 units fails", () => {
    const units = starter.filter((e) => e.kind === "unit").slice(0, 21);
    const specials = collectionFor(faction).filter((e) => e.kind !== "unit").slice(0, 10);
    expect(checkDeck(faction, leader, [...units, ...specials]).problems).toEqual(["Needs at least 22 unit cards, has 21"]);
  });
});

describe("grouping and sorting", () => {
  it("copies of one card share a group, and the group has every copy", () => {
    const groups = groupByName(collectionFor("northernRealms"));
    const stripes = groups.find((g) => g.name === "Blue Stripes Commando")!;
    expect(stripes.entries).toHaveLength(3);
    expect(new Set(stripes.entries.map((e) => e.id)).size).toBe(3);
    expect(groups.map((g) => g.name).length).toBe(new Set(groups.map((g) => g.name)).size);
  });

  it("heroes come first, then stronger cards, then specials and weather last", () => {
    const sorted = sortEntries(collectionFor("monsters"));
    const firstNonHero = sorted.findIndex((e) => !e.hero);
    expect(sorted.slice(0, firstNonHero).every((e) => e.hero && e.kind === "unit")).toBe(true);
    const kinds = sorted.map((e) => e.kind);
    expect(kinds.lastIndexOf("unit")).toBeLessThan(kinds.indexOf("special"));
    expect(kinds.lastIndexOf("special")).toBeLessThan(kinds.indexOf("weather"));
    const plain = sorted.filter((e) => e.kind === "unit" && !e.hero).map((e) => e.strength!);
    expect([...plain].sort((a, b) => b - a)).toEqual(plain);
  });

  it("sorting does not change the list it is given", () => {
    const list = collectionFor("skellige");
    const copy = [...list];
    sortEntries(list);
    expect(list).toEqual(copy);
  });
});

describe("saving a deck", () => {
  const faction: Faction = "scoiatael";
  const customIds = (): string[] => {
    const all = collectionFor(faction);
    return [...all.filter((e) => e.kind === "unit").slice(0, 24), ...all.filter((e) => e.kind === "special").slice(0, 2)].map((e) => e.id);
  };

  it("nothing is saved to begin with", () => {
    expect(loadSavedDeck(faction)).toBeNull();
  });

  it("a saved deck comes back the same", () => {
    saveDeck(faction, customIds());
    expect(loadSavedDeck(faction)).toEqual(customIds());
  });

  it("decks are kept separately for each faction", () => {
    saveDeck(faction, customIds());
    expect(loadSavedDeck("monsters")).toBeNull();
  });

  it("saving the starter deck clears a saved one", () => {
    saveDeck(faction, customIds());
    saveDeck(faction, [...starterIds(faction)].reverse());
    expect(loadSavedDeck(faction)).toBeNull();
    expect(window.localStorage.getItem(`gwent-online:deck:${faction}`)).toBeNull();
  });

  it("a saved deck that no longer passes the rules is ignored", () => {
    window.localStorage.setItem(`gwent-online:deck:${faction}`, JSON.stringify(customIds().slice(0, 10)));
    expect(loadSavedDeck(faction)).toBeNull();
  });

  it("unknown, repeated or other-faction cards are dropped, and the rest is kept if it still passes", () => {
    const good = customIds();
    const foreign = collectionFor("monsters").find((e) => e.faction === "monsters")!.id;
    window.localStorage.setItem(`gwent-online:deck:${faction}`, JSON.stringify([...good, good[0], "nope", foreign]));
    expect(loadSavedDeck(faction)).toEqual(good);
  });

  it("garbage in storage is ignored", () => {
    for (const bad of ["not json", "{}", "[1,2,3]", "null"]) {
      window.localStorage.setItem(`gwent-online:deck:${faction}`, bad);
      expect(loadSavedDeck(faction)).toBeNull();
    }
  });

  it("clearing removes it", () => {
    saveDeck(faction, customIds());
    clearSavedDeck(faction);
    expect(loadSavedDeck(faction)).toBeNull();
  });
});

describe("starting a match with your own deck", () => {
  const faction: Faction = "monsters";
  const deck = (): string[] => {
    const all = collectionFor(faction);
    return all.filter((e) => e.kind === "unit").slice(0, 25).map((e) => e.id);
  };

  it("uses your deck, card for card, instead of the starter", () => {
    const { decks } = buildMatch({ player: faction, opponent: "nilfgaard", playerDeck: deck() });
    expect(decks[0].map((c) => c.id.replace("p0-", ""))).toEqual(deck());
    expect(decks[0]).toHaveLength(25);
  });

  it("falls back to the starter if the deck breaks the rules, or has a card the faction may not use", () => {
    const starter = buildMatch({ player: faction, opponent: "nilfgaard" }).decks[0].length;
    expect(buildMatch({ player: faction, opponent: "nilfgaard", playerDeck: deck().slice(0, 5) }).decks[0]).toHaveLength(starter);
    const foreign = collectionFor("northernRealms").find((e) => e.faction === "northernRealms")!.id;
    expect(buildMatch({ player: faction, opponent: "nilfgaard", playerDeck: [...deck(), foreign] }).decks[0]).toHaveLength(starter);
  });

  it("deckFromIds rejects repeats and unknown ids", () => {
    expect(deckFromIds(faction, ["nope"], "x-")).toBeNull();
    const [one] = deck();
    expect(deckFromIds(faction, [one!, one!], "x-")).toBeNull();
    expect(deckFromIds(faction, deck(), "x-")).toHaveLength(25);
  });

  it("the opponent always gets its starter deck", () => {
    const { decks } = buildMatch({ player: faction, opponent: "skellige", playerDeck: deck() });
    expect(decks[1].length).toBe(buildMatch({ player: "skellige", opponent: "skellige" }).decks[0].length);
  });
});

describe("random legal decks play real games", () => {
  /** A seeded shuffle-and-pick of a legal deck: 22 to 30 units and up to 10 specials. */
  function randomDeck(faction: Faction, seed: number): string[] {
    const rng = seededRng(seed);
    const pool = collectionFor(faction);
    const shuffle = <T,>(xs: T[]) => xs.map((x) => [rng(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);
    const units = shuffle(pool.filter((e) => e.kind === "unit")).slice(0, 22 + Math.floor(rng() * 9));
    const specials = shuffle(pool.filter((e) => e.kind !== "unit")).slice(0, Math.floor(rng() * 11));
    return [...units, ...specials].map((e) => e.id);
  }

  it("every random deck passes the rules, and a game with it finishes without a rule being broken", () => {
    const total = (g: GameState) =>
      g.players.reduce(
        (n, p) =>
          n + p.hand.length + p.deck.length + p.graveyard.length + p.inPlay.length +
          (["close", "ranged", "siege"] as const).reduce((m, r) => m + p.board[r].units.length, 0),
        0,
      );
    let seed = 100;
    for (const faction of ids) {
      for (let i = 0; i < 4; i++) {
        seed += 1;
        const playerDeck = randomDeck(faction, seed);
        expect(checkDeck(faction, leadersFor(faction)[0]!.id, byId(faction, playerDeck)).problems, `${faction} #${i}`).toEqual([]);
        const opponent = ids[(ids.indexOf(faction) + 1 + i) % ids.length]!;
        const { decks, options } = buildMatch({ player: faction, opponent, playerDeck });
        expect(decks[0]).toHaveLength(playerDeck.length);
        const rng = seededRng(seed);
        const expected = decks[0].length + decks[1].length;
        let g = newGame({ decks, rng, redraws: 2, ...options });
        let steps = 0;
        while (g.status === "playing") {
          const actions = legalActions(g);
          const result = applyAction(g, actions[Math.floor(rng() * actions.length)]!);
          if (!result.ok) throw new Error(`${faction} v ${opponent}: ${result.error}`);
          g = result.state;
          expect(total(g)).toBe(expected);
          expect(++steps).toBeLessThan(700);
        }
        expect([0, 1, "draw"]).toContain(g.winner);
      }
    }
  }, 180_000);
});
