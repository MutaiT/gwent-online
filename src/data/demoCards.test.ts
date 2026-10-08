import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateDeck } from "../engine/deck";
import { newGame } from "../engine/game";
import { seededRng } from "../engine/rng";
import { demoDecks } from "./demoCards";

describe("demo decks", () => {
  it("are both legal under the deck-building rules", () => {
    const { decks, options } = demoDecks();
    for (const side of [0, 1] as const) {
      const result = validateDeck(decks[side], options.factions[side]!, options.leaders[side]);
      expect(result.errors).toEqual([]);
      expect(result.stats.units).toBeGreaterThanOrEqual(22);
      expect(result.stats.specials).toBeLessThanOrEqual(10);
    }
  });

  it("do not share any card ids, so ownership can always be told apart", () => {
    const { decks } = demoDecks();
    const ids = new Set(decks[0].map((c) => c.id));
    expect(decks[1].some((c) => ids.has(c.id))).toBe(false);
  });

  it("start a validated game", () => {
    const { decks, options } = demoDecks();
    const g = newGame({ decks, rng: seededRng(3), firstPlayer: 0, ...options });
    expect(g.players[0].hand).toHaveLength(10);
    expect(g.players[1].hand).toHaveLength(10);
  });

  it("give each side a medic, a spy, muster, agile, horn, scorch and a hero", () => {
    const { decks } = demoDecks();
    for (const deck of decks) {
      const abilities = new Set(deck.flatMap((c) => (c.kind === "unit" ? c.abilities : [])));
      for (const a of ["medic", "spy", "muster", "agile", "horn", "scorch", "tightBond", "moraleBoost"] as const) {
        expect(abilities.has(a)).toBe(true);
      }
      expect(deck.some((c) => c.kind === "unit" && c.isHero)).toBe(true);
    }
  });

  it("every card has artwork, and every image file exists", () => {
    const { decks } = demoDecks();
    for (const card of decks.flat()) {
      expect(card.art, `${card.name} has no art`).toMatch(/^\/art\/[a-z-]+\.webp$/);
      expect(existsSync(`public${card.art}`), `${card.art} is missing`).toBe(true);
    }
  });

  it("every image in public/art is credited, with a licence", () => {
    const credits = readFileSync("ART_CREDITS.md", "utf8");
    const { decks } = demoDecks();
    const slugs = new Set(decks.flat().map((c) => c.art!.replace("/art/", "").replace(".webp", "")));
    for (const slug of slugs) {
      const card = decks.flat().find((c) => c.art === `/art/${slug}.webp`)!;
      expect(credits, `no credit for ${card.name}`).toContain(card.name);
    }
    expect(credits).toMatch(/Public domain|CC0/i);
    expect(credits).not.toMatch(/Copyrighted/i);
  });

  it("different cards share art only when they are copies of the same card", () => {
    const { decks } = demoDecks();
    for (const deck of decks) {
      const byArt = new Map<string, Set<string>>();
      for (const card of deck) byArt.set(card.art!, (byArt.get(card.art!) ?? new Set()).add(card.name));
      for (const [art, names] of byArt) expect(names.size, `${art} is used by ${[...names].join(" and ")}`).toBe(1);
    }
  });
});
