import { describe, expect, it } from "vitest";
import { applyAction, legalActions, newGame, REDRAWS, type Action, type GameState, type PlayerId } from "./game";
import { seededRng } from "./rng";
import type { Card, UnitCard } from "./types";

function unit(id: string, basePower = 3): UnitCard {
  return { kind: "unit", id, name: id, basePower, row: "close", isHero: false, abilities: [] };
}
const deckOf = (p: string, n = 16): Card[] => Array.from({ length: n }, (_, i) => unit(`${p}${i}`, i + 1));

function start(extra: Partial<Parameters<typeof newGame>[0]> = {}): GameState {
  return newGame({ decks: [deckOf("a"), deckOf("b")], rng: seededRng(4), firstPlayer: 0, redraws: REDRAWS, ...extra });
}
function act(g: GameState, a: Action): GameState {
  const r = applyAction(g, a);
  if (!r.ok) throw new Error(`Unexpected rejection: ${r.error}`);
  return r.state;
}
function reject(g: GameState, a: Action): string {
  const r = applyAction(g, a);
  if (r.ok) throw new Error("Expected a rejection");
  return r.error;
}
const ids = (cards: readonly Card[]) => cards.map((c) => c.id);
const redraw = (g: GameState, p: PlayerId, cardId: string) => act(g, { type: "redraw", player: p, cardId });
const keep = (g: GameState, p: PlayerId) => act(g, { type: "keepHand", player: p });
const everyCard = (g: GameState) => g.players.reduce((n, p) => n + p.hand.length + p.deck.length + p.graveyard.length, 0);

describe("the opening redraw", () => {
  it("starts with player 0 choosing, and no one else may act", () => {
    const g = start();
    expect(g.pending).toEqual({ type: "redraw", player: 0, left: 2 });
    expect(g.current).toBe(0);
    expect(reject(g, { type: "pass", player: 0 })).toBe("Choose cards to redraw, or keep your hand");
    expect(reject(g, { type: "keepHand", player: 1 })).toBe("It is not your turn");
  });

  it("is off unless asked for", () => {
    const g = newGame({ decks: [deckOf("a"), deckOf("b")], rng: seededRng(4), firstPlayer: 0 });
    expect(g.pending).toBeNull();
    expect(g.current).toBe(0);
  });

  it("swaps a chosen card for the top card of the deck", () => {
    const g0 = start();
    const out = g0.players[0].hand[3]!.id;
    const incoming = g0.players[0].deck[0]!.id;
    const g = redraw(g0, 0, out);
    expect(g.players[0].hand).toHaveLength(10);
    expect(ids(g.players[0].hand)).not.toContain(out);
    expect(ids(g.players[0].hand)[3]).toBe(incoming);
    expect(ids(g.players[0].deck)).toContain(out);
    expect(g.players[0].deck).toHaveLength(g0.players[0].deck.length);
    expect(everyCard(g)).toBe(everyCard(g0));
  });

  it("the card put back cannot be drawn straight away", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const g0 = start({ rng: seededRng(seed) });
      const out = g0.players[0].hand[0]!.id;
      const g = redraw(g0, 0, out);
      expect(ids(g.players[0].hand)).not.toContain(out);
    }
  });

  it("allows two swaps, then moves on to the other player automatically", () => {
    let g = start();
    g = redraw(g, 0, g.players[0].hand[0]!.id);
    expect(g.pending).toEqual({ type: "redraw", player: 0, left: 1 });
    g = redraw(g, 0, g.players[0].hand[0]!.id);
    expect(g.pending).toEqual({ type: "redraw", player: 1, left: 2 });
    expect(g.current).toBe(1);
  });

  it("keeping the hand moves straight on, and when both are done play begins with the round starter", () => {
    let g = start({ firstPlayer: 1 });
    expect(g.current).toBe(0);
    g = keep(g, 0);
    expect(g.pending).toEqual({ type: "redraw", player: 1, left: 2 });
    g = keep(g, 1);
    expect(g.pending).toBeNull();
    expect(g.current).toBe(1);
    expect(g.round).toBe(1);
  });

  it("you can redraw one card and then keep the rest", () => {
    let g = start();
    g = redraw(g, 0, g.players[0].hand[0]!.id);
    g = keep(g, 0);
    expect(g.pending).toMatchObject({ type: "redraw", player: 1 });
  });

  it("rejects a card that is not in your hand, and a redraw when none is pending", () => {
    const g = start();
    expect(reject(g, { type: "redraw", player: 0, cardId: "nope" })).toBe("That card is not in your hand");
    const g2 = keep(keep(g, 0), 1);
    expect(reject(g2, { type: "redraw", player: g2.current, cardId: g2.players[g2.current].hand[0]!.id })).toBe(
      "There is no redraw to make",
    );
    expect(reject(g2, { type: "keepHand", player: g2.current })).toBe("There is no redraw to finish");
  });

  it("a player with an empty deck is skipped", () => {
    const g0 = newGame({ decks: [deckOf("a", 10), deckOf("b")], rng: seededRng(4), firstPlayer: 0, redraws: 2 });
    expect(g0.pending).toEqual({ type: "redraw", player: 1, left: 2 });
    expect(g0.current).toBe(1);
  });

  it("even with a one-card deck you still get both swaps, since each swap refills the deck", () => {
    let g = newGame({ decks: [deckOf("a", 11), deckOf("b", 10)], rng: seededRng(4), firstPlayer: 0, redraws: 2 });
    g = redraw(g, 0, g.players[0].hand[0]!.id);
    expect(g.pending).toEqual({ type: "redraw", player: 0, left: 1 });
    expect(g.players[0].deck).toHaveLength(1);
    g = redraw(g, 0, g.players[0].hand[0]!.id);
    expect(g.pending).toBeNull();
  });

  it("with Scoia'tael, they choose who goes first before anyone redraws", () => {
    let g = newGame({ decks: [deckOf("a"), deckOf("b")], rng: seededRng(4), factions: ["scoiatael", null], redraws: 2 });
    expect(g.pending).toEqual({ type: "chooseFirst", player: 0 });
    g = act(g, { type: "chooseFirst", player: 0, first: 1 });
    expect(g.pending).toEqual({ type: "redraw", player: 0, left: 2 });
    g = keep(keep(g, 0), 1);
    expect(g.current).toBe(1);
  });

  it("legal actions offer each card in hand, plus keeping the hand, and all are accepted", () => {
    const g = start();
    const actions = legalActions(g);
    expect(actions).toHaveLength(11);
    expect(actions.at(-1)).toEqual({ type: "keepHand", player: 0 });
    for (const a of actions) expect(applyAction(g, a).ok).toBe(true);
  });

  it("is repeatable for the same seed", () => {
    const run = () => {
      let g = start({ rng: seededRng(9) });
      g = redraw(g, 0, g.players[0].hand[2]!.id);
      return ids(g.players[0].deck).join(",");
    };
    expect(run()).toBe(run());
  });

  it("does not modify the state it was given", () => {
    const g = start();
    const snapshot = structuredClone(g);
    redraw(g, 0, g.players[0].hand[0]!.id);
    expect(g).toEqual(snapshot);
  });
});
