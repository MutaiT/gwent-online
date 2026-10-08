import { describe, expect, it } from "vitest";
import { applyAction, coinToss, legalActions, newGame, type Action, type GameState, type PlayerId } from "./game";
import { seededRng } from "./rng";
import { boardPower, rowPower } from "./scoring";
import type { Ability, Card, RowName, SpecialCard, UnitCard, WeatherType } from "./types";

function unit(
  id: string,
  basePower: number,
  row: RowName = "close",
  opts: { hero?: boolean; abilities?: Ability[] } = {},
): UnitCard {
  return { kind: "unit", id, name: id, basePower, row, isHero: opts.hero ?? false, abilities: opts.abilities ?? [] };
}

const weather = (id: string, w: WeatherType): SpecialCard => ({ kind: "special", id, name: id, effect: "weather", weather: w });
const horn = (id = "horn"): SpecialCard => ({ kind: "special", id, name: id, effect: "horn" });
const decoy = (id = "decoy"): SpecialCard => ({ kind: "special", id, name: id, effect: "decoy" });
const scorch = (id = "scorch"): SpecialCard => ({ kind: "special", id, name: id, effect: "scorch" });

function filler(owner: string): Card[] {
  return Array.from({ length: 14 }, (_, i) => unit(`${owner}f${i}`, 1));
}

/** A fresh game where player 0 starts, with the given cards at the front of each hand. */
function setup(hand0: Card[], hand1: Card[] = []): GameState {
  const g = newGame({ decks: [filler("a"), filler("b")], firstPlayer: 0, rng: seededRng(1) });
  g.players[0].hand = [...hand0, ...g.players[0].hand];
  g.players[1].hand = [...hand1, ...g.players[1].hand];
  return g;
}

function put(g: GameState, player: PlayerId, row: RowName, ...units: UnitCard[]): void {
  g.players[player].board[row].units.push(...units);
}

function act(state: GameState, action: Action): GameState {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`Unexpected rejection: ${r.error}`);
  return r.state;
}

function reject(state: GameState, action: Action): string {
  const r = applyAction(state, action);
  if (r.ok) throw new Error("Expected the action to be rejected");
  return r.error;
}

const play = (g: GameState, player: PlayerId, cardId: string, extra: { row?: RowName; targetId?: string } = {}) =>
  act(g, { type: "play", player, cardId, ...extra });

describe("weather", () => {
  it.each([
    ["bitingFrost", ["close"]],
    ["impenetrableFog", ["ranged"]],
    ["torrentialRain", ["siege"]],
    ["skelligeStorm", ["ranged", "siege"]],
  ] as const)("%s affects only its rows, on both sides", (type, affected) => {
    const g = play(setup([weather("w", type)]), 0, "w");
    for (const player of [0, 1] as const) {
      for (const row of ["close", "ranged", "siege"] as const) {
        expect(g.players[player].board[row].weather).toBe((affected as readonly RowName[]).includes(row));
      }
    }
  });

  it("reduces the score of both players' units in the row", () => {
    const g0 = setup([weather("w", "bitingFrost")]);
    put(g0, 0, "close", unit("m1", 6), unit("m2", 8));
    put(g0, 1, "close", unit("t1", 5));
    expect(boardPower(g0.players[0].board)).toBe(14);
    const g = play(g0, 0, "w");
    expect(boardPower(g.players[0].board)).toBe(2);
    expect(boardPower(g.players[1].board)).toBe(1);
  });

  it("applies to units played into the row afterwards", () => {
    let g = play(setup([weather("w", "bitingFrost")], [unit("late", 9)]), 0, "w");
    g = play(g, 1, "late");
    expect(rowPower(g.players[1].board.close)).toBe(1);
  });

  it("keeps the card in play and passes the turn", () => {
    const g = play(setup([weather("w", "torrentialRain")]), 0, "w");
    expect(g.players[0].inPlay.map((c) => c.id)).toEqual(["w"]);
    expect(g.current).toBe(1);
  });

  it("Clear Weather removes all weather, and sends weather cards and itself to the graveyard", () => {
    let g = play(setup([weather("frost", "bitingFrost"), weather("clear", "clearWeather")]), 0, "frost");
    g = act(g, { type: "pass", player: 1 });
    g = play(g, 0, "clear");
    for (const player of [0, 1] as const) {
      for (const row of ["close", "ranged", "siege"] as const) {
        expect(g.players[player].board[row].weather).toBe(false);
      }
    }
    expect(g.players[0].inPlay).toEqual([]);
    expect(g.players[0].graveyard.map((c) => c.id).sort()).toEqual(["clear", "frost"]);
  });

  it("Clear Weather with no weather in play is still allowed", () => {
    const g = play(setup([weather("clear", "clearWeather")]), 0, "clear");
    expect(g.players[0].graveyard.map((c) => c.id)).toEqual(["clear"]);
  });

  it("lasts until the round ends, then goes to its owner's graveyard", () => {
    let g = play(setup([weather("w", "bitingFrost")]), 0, "w");
    g = act(g, { type: "pass", player: 1 });
    g = act(g, { type: "pass", player: 0 });
    expect(g.round).toBe(2);
    expect(g.players[0].board.close.weather).toBe(false);
    expect(g.players[1].board.close.weather).toBe(false);
    expect(g.players[0].inPlay).toEqual([]);
    expect(g.players[0].graveyard.map((c) => c.id)).toEqual(["w"]);
  });

  it("a weather card played by player 1 goes to player 1's graveyard", () => {
    let g = act(setup([], [weather("w", "bitingFrost")]), { type: "pass", player: 0 });
    g = play(g, 1, "w");
    g = act(g, { type: "pass", player: 1 });
    expect(g.players[1].graveyard.map((c) => c.id)).toEqual(["w"]);
    expect(g.players[0].graveyard).toEqual([]);
  });
});

describe("commander's horn", () => {
  it("doubles the row it is played on", () => {
    const g0 = setup([horn()]);
    put(g0, 0, "ranged", unit("a", 3, "ranged"), unit("b", 4, "ranged"));
    const g = play(g0, 0, "horn", { row: "ranged" });
    expect(rowPower(g.players[0].board.ranged)).toBe(14);
    expect(g.players[0].board.ranged.hornCard).toBe(true);
  });

  it("does not affect other rows or the opponent", () => {
    const g0 = setup([horn()]);
    put(g0, 0, "close", unit("a", 3));
    put(g0, 1, "ranged", unit("t", 5, "ranged"));
    const g = play(g0, 0, "horn", { row: "ranged" });
    expect(rowPower(g.players[0].board.close)).toBe(3);
    expect(rowPower(g.players[1].board.ranged)).toBe(5);
  });

  it("needs a row", () => {
    expect(reject(setup([horn()]), { type: "play", player: 0, cardId: "horn" })).toBe("Choose a row for the horn");
  });

  it("only one horn per row", () => {
    let g = play(setup([horn("h1"), horn("h2")]), 0, "h1", { row: "siege" });
    g = act(g, { type: "pass", player: 1 });
    expect(reject(g, { type: "play", player: 0, cardId: "h2", row: "siege" })).toBe("That row already has a horn");
    expect(play(g, 0, "h2", { row: "close" }).players[0].board.close.hornCard).toBe(true);
  });

  it("a rejected horn leaves the card in hand", () => {
    const g = setup([horn()]);
    reject(g, { type: "play", player: 0, cardId: "horn" });
    expect(g.players[0].hand.some((c) => c.id === "horn")).toBe(true);
  });

  it("goes to the graveyard when the round ends", () => {
    let g = play(setup([horn()]), 0, "horn", { row: "close" });
    g = act(g, { type: "pass", player: 1 });
    g = act(g, { type: "pass", player: 0 });
    expect(g.players[0].board.close.hornCard).toBe(false);
    expect(g.players[0].graveyard.map((c) => c.id)).toEqual(["horn"]);
  });
});

describe("decoy", () => {
  it("swaps a unit on your board back into your hand", () => {
    const g0 = setup([decoy()]);
    put(g0, 0, "close", unit("big", 8), unit("small", 2));
    const g = play(g0, 0, "decoy", { targetId: "big" });
    expect(g.players[0].board.close.units.map((u) => u.id)).toEqual(["small"]);
    expect(g.players[0].hand.some((c) => c.id === "big")).toBe(true);
    expect(g.players[0].inPlay.map((c) => c.id)).toEqual(["decoy"]);
    expect(g.players[0].hand.some((c) => c.id === "decoy")).toBe(false);
  });

  it("finds the unit in any row", () => {
    const g0 = setup([decoy()]);
    put(g0, 0, "siege", unit("catapult", 6, "siege"));
    const g = play(g0, 0, "decoy", { targetId: "catapult" });
    expect(g.players[0].board.siege.units).toEqual([]);
  });

  it("needs a target", () => {
    expect(reject(setup([decoy()]), { type: "play", player: 0, cardId: "decoy" })).toBe(
      "Choose a unit to swap with the decoy",
    );
  });

  it("cannot target a hero", () => {
    const g0 = setup([decoy()]);
    put(g0, 0, "close", unit("hero", 10, "close", { hero: true }));
    expect(reject(g0, { type: "play", player: 0, cardId: "decoy", targetId: "hero" })).toBe("A hero cannot be swapped");
  });

  it("cannot target the opponent's unit", () => {
    const g0 = setup([decoy()]);
    put(g0, 1, "close", unit("theirs", 5));
    expect(reject(g0, { type: "play", player: 0, cardId: "decoy", targetId: "theirs" })).toBe(
      "That unit is not on your board",
    );
  });

  it("a rejected decoy leaves the hand and board unchanged", () => {
    const g0 = setup([decoy()]);
    put(g0, 0, "close", unit("a", 3));
    reject(g0, { type: "play", player: 0, cardId: "decoy", targetId: "missing" });
    expect(g0.players[0].hand.some((c) => c.id === "decoy")).toBe(true);
    expect(g0.players[0].board.close.units).toHaveLength(1);
  });

  it("the returned unit can be played again, and the decoy goes to the graveyard at round end", () => {
    const g0 = setup([decoy()]);
    put(g0, 0, "close", unit("big", 8));
    let g = play(g0, 0, "decoy", { targetId: "big" });
    g = act(g, { type: "pass", player: 1 });
    g = play(g, 0, "big");
    expect(rowPower(g.players[0].board.close)).toBe(8);
    g = act(g, { type: "pass", player: 0 });
    expect(g.players[0].graveyard.map((c) => c.id).sort()).toEqual(["big", "decoy"]);
  });
});

describe("scorch", () => {
  it("destroys the strongest non-hero unit on the whole board, either side", () => {
    const g0 = setup([scorch()]);
    put(g0, 0, "close", unit("mine", 5));
    put(g0, 1, "ranged", unit("theirs", 9, "ranged"), unit("weak", 2, "ranged"));
    const g = play(g0, 0, "scorch");
    expect(g.players[1].board.ranged.units.map((u) => u.id)).toEqual(["weak"]);
    expect(g.players[0].board.close.units.map((u) => u.id)).toEqual(["mine"]);
    expect(g.players[1].graveyard.map((c) => c.id)).toEqual(["theirs"]);
  });

  it("destroys all units tied for strongest, on both sides", () => {
    const g0 = setup([scorch()]);
    put(g0, 0, "close", unit("m1", 7), unit("m2", 3));
    put(g0, 1, "siege", unit("t1", 7, "siege"));
    const g = play(g0, 0, "scorch");
    expect(g.players[0].board.close.units.map((u) => u.id)).toEqual(["m2"]);
    expect(g.players[1].board.siege.units).toEqual([]);
    expect(g.players[0].graveyard.map((c) => c.id).sort()).toEqual(["m1", "scorch"]);
  });

  it("never destroys heroes, even the strongest card", () => {
    const g0 = setup([scorch()]);
    put(g0, 0, "close", unit("hero", 15, "close", { hero: true }), unit("m", 4));
    const g = play(g0, 0, "scorch");
    expect(g.players[0].board.close.units.map((u) => u.id)).toEqual(["hero"]);
  });

  it("compares current strength, so weather and horn count", () => {
    const g0 = setup([scorch()]);
    // Raw 10 but crushed by frost to 1; raw 4 but doubled by a horn to 8.
    put(g0, 0, "close", unit("frozen", 10));
    g0.players[0].board.close.weather = true;
    put(g0, 1, "ranged", unit("boosted", 4, "ranged"));
    g0.players[1].board.ranged.hornCard = true;
    const g = play(g0, 0, "scorch");
    expect(g.players[1].board.ranged.units).toEqual([]);
    expect(g.players[0].board.close.units.map((u) => u.id)).toEqual(["frozen"]);
  });

  it("with no targets it just goes to the graveyard", () => {
    const g0 = setup([scorch()]);
    put(g0, 0, "close", unit("hero", 10, "close", { hero: true }));
    const g = play(g0, 0, "scorch");
    expect(g.players[0].graveyard.map((c) => c.id)).toEqual(["scorch"]);
    expect(g.players[0].board.close.units).toHaveLength(1);
  });
});

describe("legal actions with special cards", () => {
  it("offers a horn for each row that has none, and a decoy for each non-hero unit", () => {
    const g0 = setup([horn(), decoy()]);
    put(g0, 0, "close", unit("a", 3), unit("hero", 9, "close", { hero: true }));
    g0.players[0].board.siege.hornCard = true;
    const actions = legalActions(g0);
    const horns = actions.filter((a) => a.type === "play" && a.cardId === "horn");
    const decoys = actions.filter((a) => a.type === "play" && a.cardId === "decoy");
    expect(horns.map((a) => (a as { row?: RowName }).row).sort()).toEqual(["close", "ranged"]);
    expect(decoys.map((a) => (a as { targetId?: string }).targetId)).toEqual(["a"]);
  });

  it("every listed action is accepted", () => {
    const g0 = setup([horn(), decoy(), scorch(), weather("w", "skelligeStorm"), weather("c", "clearWeather")]);
    put(g0, 0, "close", unit("a", 3));
    for (const action of legalActions(g0)) {
      expect(applyAction(g0, action).ok).toBe(true);
    }
  });
});

describe("random play with special cards", () => {
  function mixedDeck(owner: string): Card[] {
    const units = Array.from({ length: 12 }, (_, i) =>
      unit(`${owner}u${i}`, (i % 6) + 1, (["close", "ranged", "siege"] as const)[i % 3], { hero: i === 0 }),
    );
    return [
      ...units,
      horn(`${owner}horn`),
      decoy(`${owner}decoy`),
      scorch(`${owner}scorch`),
      weather(`${owner}frost`, "bitingFrost"),
      weather(`${owner}storm`, "skelligeStorm"),
      weather(`${owner}clear`, "clearWeather"),
    ];
  }

  function total(g: GameState, p: PlayerId): number {
    const s = g.players[p];
    const onBoard = (["close", "ranged", "siege"] as const).reduce((n, r) => n + s.board[r].units.length, 0);
    return s.hand.length + s.deck.length + s.graveyard.length + s.inPlay.length + onBoard;
  }

  it("never rejects a listed action, never loses a card, and always finishes", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const rng = seededRng(seed);
      let g = newGame({ decks: [mixedDeck("a"), mixedDeck("b")], firstPlayer: coinToss(rng), rng });
      let steps = 0;
      while (g.status === "playing") {
        const actions = legalActions(g);
        g = act(g, actions[Math.floor(rng() * actions.length)]!);
        expect(total(g, 0)).toBe(18);
        expect(total(g, 1)).toBe(18);
        expect(++steps).toBeLessThan(300);
      }
      expect([0, 1, "draw"]).toContain(g.winner);
    }
  });
});
