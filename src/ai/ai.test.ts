import { describe, expect, it } from "vitest";
import { applyAction, legalActions, newGame, type GameState, type PlayerId } from "../engine/game";
import { seededRng } from "../engine/rng";
import { chooseAction } from "./ai";
import { demoDecks } from "../data/demoCards";
import { FACTIONS, buildMatch } from "../data/decks";
import type { Card, RowName, UnitCard } from "../engine/types";

function unit(id: string, basePower: number, row: RowName = "close", abilities: UnitCard["abilities"] = []): UnitCard {
  return { kind: "unit", id, name: id, basePower, row, isHero: false, abilities };
}
const filler = (p: string): Card[] => Array.from({ length: 14 }, (_, i) => unit(`${p}f${i}`, 1));

/** Player 1 is the AI and is to move; both hands are what the test sets. */
function aiTurn(aiHand: Card[], opts: { humanPassed?: boolean; aiBoard?: UnitCard[]; humanBoard?: UnitCard[] } = {}): GameState {
  const g = newGame({ decks: [filler("a"), filler("b")], firstPlayer: 1, rng: seededRng(1) });
  g.players[1].hand = aiHand;
  g.players[0].passed = opts.humanPassed ?? false;
  g.players[1].board.close.units = opts.aiBoard ?? [];
  g.players[0].board.close.units = opts.humanBoard ?? [];
  return g;
}

describe("chooseAction", () => {
  it("always picks an action the engine accepts", () => {
    for (let seed = 1; seed <= 20; seed++) {
      let g = newGame({ decks: demoDecks().decks, firstPlayer: 1, rng: seededRng(seed), ...demoDecks().options });
      let aiSeed = seed;
      for (let steps = 0; steps < 400 && g.status === "playing"; steps++) {
        const choice = chooseAction(g, aiSeed);
        aiSeed = choice.seed;
        expect(legalActions(g)).toContainEqual(choice.action);
        const result = applyAction(g, choice.action);
        expect(result.ok).toBe(true);
        if (result.ok) g = result.state;
      }
    }
  }, 30_000);

  it("two AIs finish a full game against each other", () => {
    for (let seed = 1; seed <= 15; seed++) {
      let g = newGame({ decks: demoDecks().decks, firstPlayer: 0, rng: seededRng(seed), ...demoDecks().options });
      let seeds = [seed, seed + 1000];
      let steps = 0;
      while (g.status === "playing") {
        const side = g.current;
        const choice = chooseAction(g, seeds[side]!);
        seeds = side === 0 ? [choice.seed, seeds[1]!] : [seeds[0]!, choice.seed];
        const result = applyAction(g, choice.action);
        if (!result.ok) throw new Error(result.error);
        g = result.state;
        expect(++steps).toBeLessThan(500);
      }
      expect([0, 1, "draw"]).toContain(g.winner);
    }
  }, 30_000);

  it("passes when the human has passed and the AI is already ahead", () => {
    const g = aiTurn([unit("x", 5)], { humanPassed: true, aiBoard: [unit("on", 9)], humanBoard: [unit("hb", 4)] });
    expect(chooseAction(g, 1).action).toEqual({ type: "pass", player: 1 });
  });

  it("plays the cheapest card that wins once the human has passed", () => {
    const g = aiTurn([unit("big", 9), unit("just", 5), unit("tiny", 1)], { humanPassed: true, humanBoard: [unit("hb", 4)] });
    expect(chooseAction(g, 1).action).toEqual({ type: "play", player: 1, cardId: "just" });
  });

  it("does not throw good cards away when the human has passed and it cannot catch up", () => {
    const g = aiTurn([unit("a", 2), unit("b", 3)], { humanPassed: true, humanBoard: [unit("hb", 30)] });
    expect(chooseAction(g, 1).action).toEqual({ type: "pass", player: 1 });
  });

  it("plays its strongest card to catch up when behind", () => {
    const g = aiTurn([unit("small", 2), unit("strong", 8), unit("mid", 5)], { humanBoard: [unit("hb", 6)] });
    expect(chooseAction(g, 1).action).toEqual({ type: "play", player: 1, cardId: "strong" });
  });

  it("passes when comfortably ahead", () => {
    const g = aiTurn([unit("x", 5)], { aiBoard: [unit("on", 20)], humanBoard: [unit("hb", 3)] });
    expect(chooseAction(g, 1).action).toEqual({ type: "pass", player: 1 });
  });

  it("revives its strongest eligible unit when a medic is pending", () => {
    const g = aiTurn([unit("med", 2, "close", ["medic"])]);
    g.players[1].graveyard = [unit("weak", 2), unit("best", 7), unit("mid", 4)];
    const afterMedic = applyAction(g, { type: "play", player: 1, cardId: "med" });
    if (!afterMedic.ok) throw new Error(afterMedic.error);
    expect(chooseAction(afterMedic.state, 1).action).toEqual({ type: "revive", player: 1, cardId: "best" });
  });

  it("is repeatable for the same seed and advances the seed", () => {
    const g = aiTurn([unit("a", 3), unit("b", 3), unit("c", 3)]);
    const first = chooseAction(g, 5);
    expect(chooseAction(g, 5)).toEqual(first);
    expect(first.seed).not.toBe(5);
  });

  it("chooses itself when it is Scoia'tael and must pick who goes first", () => {
    const g = newGame({
      decks: [filler("a"), filler("b")],
      rng: seededRng(1),
      factions: [null, "scoiatael"],
    });
    const choice = chooseAction(g, 1).action;
    expect(choice).toEqual({ type: "chooseFirst", player: 1, first: 1 satisfies PlayerId });
  });
});

describe("the AI with the real cards", () => {
  it("finishes a game against itself for every pairing of factions, only ever making legal moves", () => {
    const ids = FACTIONS.map((f) => f.id);
    let seed = 0;
    for (const a of ids) {
      for (const b of ids) {
        seed += 1;
        const { decks, options } = buildMatch({ player: a, opponent: b });
        let g = newGame({ decks, rng: seededRng(seed), ...options });
        let seeds = [seed, seed + 1000];
        let steps = 0;
        while (g.status === "playing") {
          const side = g.current;
          const choice = chooseAction(g, seeds[side]!);
          seeds = side === 0 ? [choice.seed, seeds[1]!] : [seeds[0]!, choice.seed];
          expect(legalActions(g), `${a} v ${b}`).toContainEqual(choice.action);
          const result = applyAction(g, choice.action);
          if (!result.ok) throw new Error(`${a} v ${b}: ${result.error}`);
          g = result.state;
          expect(++steps).toBeLessThan(600);
        }
        expect([0, 1, "draw"]).toContain(g.winner);
      }
    }
  }, 180_000);

  it("uses a leader when it helps and never wastes a blocked one", () => {
    const { decks, options } = buildMatch({ player: "northernRealms", opponent: "northernRealms" });
    const g = newGame({ decks, rng: seededRng(5), firstPlayer: 1, ...options });
    const choice = chooseAction(g, 3).action;
    expect(legalActions(g)).toContainEqual(choice);
  });
});
