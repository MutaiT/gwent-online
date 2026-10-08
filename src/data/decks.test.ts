import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateDeck } from "../engine/deck";
import { applyAction, legalActions, newGame, type GameState } from "../engine/game";
import { seededRng } from "../engine/rng";
import type { Faction } from "../engine/types";
import { CATALOG } from "./catalog";
import { FACTIONS, buildMatch, leadersFor, starterDeck, unavailableLeaders } from "./decks";

const ids = FACTIONS.map((f) => f.id);

describe("the card catalogue", () => {
  it("has a picture file for every card", () => {
    for (const entry of CATALOG) expect(existsSync(`public${entry.art}`), `${entry.name} (${entry.art})`).toBe(true);
  });

  it("has unique ids", () => {
    const seen = new Set<string>();
    for (const entry of CATALOG) {
      expect(seen.has(entry.id), entry.id).toBe(false);
      seen.add(entry.id);
    }
  });

  it("gives every unit a row and a strength, and every weather and special card its kind", () => {
    for (const e of CATALOG) {
      if (e.kind === "unit") {
        expect(["close", "ranged", "siege"]).toContain(e.row);
        expect(Number.isInteger(e.strength)).toBe(true);
      }
      if (e.kind === "weather") expect(e.weather).toBeTruthy();
      if (e.kind === "special") expect(["horn", "decoy", "scorch"]).toContain(e.special);
    }
  });

  it("covers every faction, with leaders, units, and the shared specials", () => {
    for (const f of ids) {
      expect(CATALOG.some((e) => e.faction === f && e.kind === "unit")).toBe(true);
      expect(CATALOG.some((e) => e.faction === f && e.kind === "leader")).toBe(true);
    }
    expect(CATALOG.filter((e) => e.kind === "weather").length).toBeGreaterThanOrEqual(5);
    expect(CATALOG.filter((e) => e.kind === "special").length).toBeGreaterThanOrEqual(9);
  });

  it("records the abilities the real cards have", () => {
    const byName = (n: string) => CATALOG.find((e) => e.name === n)!;
    expect(byName("Vernon Roche")).toMatchObject({ strength: 10, hero: true, row: "close" });
    expect(byName("Milva")).toMatchObject({ strength: 10, row: "ranged", abilities: ["moraleBoost"] });
    expect(byName("Dandelion").abilities).toEqual(["horn"]);
    expect(byName("Yennefer of Vengerberg")).toMatchObject({ hero: true, abilities: ["medic"], row: "ranged" });
    expect(byName("Villentretenmerth").abilities).toEqual(["scorch"]);
    expect(byName("Kayran")).toMatchObject({ hero: true, abilities: ["moraleBoost", "agile"] });
    expect(byName("Thaler")).toMatchObject({ abilities: ["spy"], row: "siege", strength: 1 });
    expect(CATALOG.filter((e) => e.name === "Blue Stripes Commando")).toHaveLength(3);
    expect(CATALOG.filter((e) => e.name === "Blue Stripes Commando").every((e) => e.bond && e.abilities?.includes("tightBond"))).toBe(true);
  });

  it("marks cards that need abilities we do not have yet, and keeps them out of decks", () => {
    const berserker = CATALOG.find((e) => e.name === "Berserker")!;
    expect(berserker.unsupported).toBeTruthy();
    const deck = starterDeck("skellige", "t-");
    expect(deck.some((c) => c.name.includes("Berserker") || c.name === "Mardroeme" || c.name === "Cow")).toBe(false);
  });
});

describe("starter decks", () => {
  it.each(ids)("%s deck is legal, with a usable leader", (faction) => {
    const leader = leadersFor(faction)[0]!;
    const result = validateDeck(starterDeck(faction, "x-"), faction, leader);
    expect(result.errors).toEqual([]);
    expect(result.stats.units).toBeGreaterThanOrEqual(22);
    expect(result.stats.specials).toBeLessThanOrEqual(10);
  });

  it.each(ids)("%s has at least one usable leader", (faction) => {
    expect(leadersFor(faction).length).toBeGreaterThan(0);
    for (const leader of leadersFor(faction)) expect(leader.officialFace).toBe(true);
  });

  it("lists leaders that are not usable yet separately", () => {
    const names = unavailableLeaders("nilfgaard").map((l) => l.name);
    expect(names).toContain("Emhyr var Emreis: The White Flame");
    expect(leadersFor("nilfgaard").map((l) => l.name)).not.toContain("Emhyr var Emreis: The White Flame");
  });

  it("both players can pick the same faction without clashing ids", () => {
    const { decks } = buildMatch({ player: "monsters", opponent: "monsters" });
    const all = [...decks[0], ...decks[1]].map((c) => c.id);
    expect(new Set(all).size).toBe(all.length);
  });

  it("every deck uses only cards of its own faction or neutral ones", () => {
    for (const f of ids) {
      for (const card of starterDeck(f, "y-")) {
        if (card.kind === "unit") expect(card.faction === undefined || card.faction === f).toBe(true);
      }
    }
  });
});

describe("real games with real cards", () => {
  function pairs(): [Faction, Faction][] {
    return ids.flatMap((a) => ids.map((b): [Faction, Faction] => [a, b]));
  }

  it("start a validated game for every pairing of factions", () => {
    for (const [player, opponent] of pairs()) {
      const { decks, options } = buildMatch({ player, opponent });
      const g = newGame({ decks, rng: seededRng(1), firstPlayer: 0, ...options });
      expect(g.players[0].hand).toHaveLength(10);
      expect(g.players[1].hand).toHaveLength(10);
    }
  });

  it("finish without rejecting a listed action or losing a card, for every pairing", () => {
    const total = (g: GameState) =>
      g.players.reduce(
        (n, p) =>
          n + p.hand.length + p.deck.length + p.graveyard.length + p.inPlay.length +
          (["close", "ranged", "siege"] as const).reduce((m, r) => m + p.board[r].units.length, 0),
        0,
      );
    for (const [player, opponent] of pairs()) {
      for (const seed of [1, 2]) {
        const rng = seededRng(seed * 31 + player.length);
        const { decks, options } = buildMatch({ player, opponent });
        const expected = decks[0].length + decks[1].length;
        let g = newGame({ decks, rng, ...options });
        let steps = 0;
        while (g.status === "playing") {
          const actions = legalActions(g);
          const result = applyAction(g, actions[Math.floor(rng() * actions.length)]!);
          if (!result.ok) throw new Error(`${player} v ${opponent}: ${result.error}`);
          g = result.state;
          expect(total(g)).toBe(expected);
          expect(++steps).toBeLessThan(600);
        }
        expect([0, 1, "draw"]).toContain(g.winner);
      }
    }
  }, 120_000);
});
