import { describe, expect, it } from "vitest";
import { applyAction, coinToss, legalActions, newGame, type Action, type GameState, type PlayerId } from "./game";
import { seededRng } from "./rng";
import { boardPower, rowPower } from "./scoring";
import type { Ability, Card, RowName, SpecialCard, UnitCard, WeatherType } from "./types";

interface UnitOpts {
  hero?: boolean;
  abilities?: Ability[];
  muster?: string;
  bond?: string;
}

function unit(id: string, basePower: number, row: RowName = "close", opts: UnitOpts = {}): UnitCard {
  return {
    kind: "unit",
    id,
    name: id,
    basePower,
    row,
    isHero: opts.hero ?? false,
    abilities: opts.abilities ?? [],
    musterGroup: opts.muster,
    bondGroup: opts.bond,
  };
}

const special = (id: string, effect: "horn" | "decoy" | "scorch"): SpecialCard => ({ kind: "special", id, name: id, effect });
const weather = (id: string, w: WeatherType): SpecialCard => ({ kind: "special", id, name: id, effect: "weather", weather: w });

function filler(owner: string): Card[] {
  return Array.from({ length: 14 }, (_, i) => unit(`${owner}f${i}`, 1));
}

/** Player 0 starts. The given cards go on top of each hand and deck. */
function setup(hand0: Card[], hand1: Card[] = [], deck0: Card[] = [], deck1: Card[] = []): GameState {
  const g = newGame({ decks: [filler("a"), filler("b")], firstPlayer: 0, rng: seededRng(1) });
  g.players[0].hand = [...hand0, ...g.players[0].hand];
  g.players[1].hand = [...hand1, ...g.players[1].hand];
  g.players[0].deck = [...deck0, ...g.players[0].deck];
  g.players[1].deck = [...deck1, ...g.players[1].deck];
  return g;
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
const pass = (g: GameState, player: PlayerId) => act(g, { type: "pass", player });
const revive = (g: GameState, player: PlayerId, cardId: string) => act(g, { type: "revive", player, cardId });
const ids = (cards: readonly Card[]) => cards.map((c) => c.id);

describe("agile", () => {
  const agile = () => unit("ag", 6, "close", { abilities: ["agile"] });

  it("can be played to close combat or ranged", () => {
    expect(play(setup([agile()]), 0, "ag", { row: "close" }).players[0].board.close.units).toHaveLength(1);
    expect(play(setup([agile()]), 0, "ag", { row: "ranged" }).players[0].board.ranged.units).toHaveLength(1);
  });

  it("defaults to its printed row", () => {
    expect(play(setup([agile()]), 0, "ag").players[0].board.close.units).toHaveLength(1);
  });

  it("cannot be played to siege", () => {
    expect(reject(setup([agile()]), { type: "play", player: 0, cardId: "ag", row: "siege" })).toBe(
      "That card cannot be played to the siege row",
    );
  });

  it("a normal unit cannot be moved to another row", () => {
    const g = setup([unit("u", 4, "siege")]);
    expect(reject(g, { type: "play", player: 0, cardId: "u", row: "close" })).toBe(
      "That card cannot be played to the close row",
    );
    expect(play(g, 0, "u", { row: "siege" }).players[0].board.siege.units).toHaveLength(1);
  });

  it("takes the effects of the row it was played to", () => {
    let g = setup([agile(), weather("frost", "bitingFrost")]);
    g = play(g, 0, "frost");
    g = pass(g, 1);
    g = play(g, 0, "ag", { row: "ranged" });
    expect(rowPower(g.players[0].board.ranged)).toBe(6);
    expect(boardPower(g.players[0].board)).toBe(6);
  });

  it("legal actions offer both rows", () => {
    const rows = legalActions(setup([agile()]))
      .filter((a) => a.type === "play" && a.cardId === "ag")
      .map((a) => (a as { row?: RowName }).row)
      .sort();
    expect(rows).toEqual(["close", "ranged"]);
  });
});

describe("spy", () => {
  const spy = () => unit("spy", 7, "close", { abilities: ["spy"] });

  it("is placed on the opponent's board and scores for them", () => {
    const g = play(setup([spy()]), 0, "spy");
    expect(g.players[1].board.close.units.map((u) => u.id)).toEqual(["spy"]);
    expect(g.players[0].board.close.units).toEqual([]);
    expect(boardPower(g.players[1].board)).toBe(7);
    expect(boardPower(g.players[0].board)).toBe(0);
  });

  it("draws two cards from the top of the deck for its owner", () => {
    const g0 = setup([spy()], [], [unit("d1", 2), unit("d2", 3), unit("d3", 4)]);
    const before = g0.players[0];
    const g = play(g0, 0, "spy");
    expect(g.players[0].hand).toHaveLength(before.hand.length - 1 + 2);
    expect(ids(g.players[0].hand).slice(-2)).toEqual(["d1", "d2"]);
    expect(g.players[0].deck).toHaveLength(before.deck.length - 2);
    expect(g.players[0].deck[0]!.id).toBe("d3");
  });

  it("draws what it can when the deck is short", () => {
    const g0 = setup([spy()]);
    g0.players[0].deck = [unit("only", 1)];
    const g = play(g0, 0, "spy");
    expect(g.players[0].deck).toEqual([]);
    expect(ids(g.players[0].hand)).toContain("only");
  });

  it("returns to its owner's graveyard when the round ends", () => {
    let g = play(setup([spy()]), 0, "spy");
    g = pass(g, 1);
    g = pass(g, 0);
    expect(ids(g.players[0].graveyard)).toContain("spy");
    expect(ids(g.players[1].graveyard)).not.toContain("spy");
  });

  it("cannot be taken with the opponent's decoy", () => {
    const g = play(setup([spy()], [special("decoy", "decoy")]), 0, "spy");
    expect(reject(g, { type: "play", player: 1, cardId: "decoy", targetId: "spy" })).toBe(
      "That unit is not on your board",
    );
    expect(legalActions(g).some((a) => a.type === "play" && a.cardId === "decoy" && "targetId" in a)).toBe(false);
  });

  it("when scorched, goes to its owner's graveyard", () => {
    let g = play(setup([spy()], [special("scorch", "scorch")]), 0, "spy");
    g = play(g, 1, "scorch");
    expect(g.players[1].board.close.units).toEqual([]);
    expect(ids(g.players[0].graveyard)).toEqual(["spy"]);
    expect(ids(g.players[1].graveyard)).toEqual(["scorch"]);
  });
});

describe("muster", () => {
  const goblin = (id: string, row: RowName = "close") => unit(id, 3, row, { abilities: ["muster"], muster: "goblin" });

  it("brings every card of the same group out of the deck", () => {
    const g0 = setup([goblin("g1")], [], [goblin("g2"), goblin("g3", "ranged"), unit("other", 5)]);
    const deckBefore = g0.players[0].deck.length;
    const g = play(g0, 0, "g1");
    expect(g.players[0].board.close.units.map((u) => u.id).sort()).toEqual(["g1", "g2"]);
    expect(g.players[0].board.ranged.units.map((u) => u.id)).toEqual(["g3"]);
    expect(g.players[0].deck).toHaveLength(deckBefore - 2);
    expect(ids(g.players[0].deck)).toContain("other");
  });

  it("does not pull from the hand", () => {
    const g = play(setup([goblin("g1"), goblin("inhand")]), 0, "g1");
    expect(ids(g.players[0].hand)).toContain("inhand");
    expect(g.players[0].board.close.units.map((u) => u.id)).toEqual(["g1"]);
  });

  it("leaves other groups alone and works with no matches", () => {
    const g0 = setup([goblin("g1")], [], [unit("o", 4, "close", { abilities: ["muster"], muster: "orc" })]);
    const g = play(g0, 0, "g1");
    expect(g.players[0].board.close.units.map((u) => u.id)).toEqual(["g1"]);
    expect(ids(g.players[0].deck)).toContain("o");
  });

  it("scores every mustered unit", () => {
    const g = play(setup([goblin("g1")], [], [goblin("g2"), goblin("g3")]), 0, "g1");
    expect(boardPower(g.players[0].board)).toBe(9);
  });
});

describe("medic", () => {
  const medic = (id = "med") => unit(id, 2, "close", { abilities: ["medic"] });

  it("waits for a choice when there is something to revive", () => {
    const g0 = setup([medic()]);
    g0.players[0].graveyard.push(unit("dead", 5));
    const g = play(g0, 0, "med");
    expect(g.pending).toEqual({ type: "revive", player: 0 });
    expect(g.current).toBe(0);
  });

  it("blocks every other action until the choice is made", () => {
    const g0 = setup([medic()]);
    g0.players[0].graveyard.push(unit("dead", 5));
    const g = play(g0, 0, "med");
    expect(reject(g, { type: "pass", player: 0 })).toBe("Choose a unit to revive first");
    expect(reject(g, { type: "play", player: 0, cardId: g.players[0].hand[0]!.id })).toBe("Choose a unit to revive first");
    expect(reject(g, { type: "pass", player: 1 })).toBe("It is not your turn");
    expect(legalActions(g)).toEqual([{ type: "revive", player: 0, cardId: "dead" }]);
  });

  it("revives the chosen unit onto the board and passes the turn", () => {
    const g0 = setup([medic()]);
    g0.players[0].graveyard.push(unit("dead", 5), unit("dead2", 4));
    const g = revive(play(g0, 0, "med"), 0, "dead");
    expect(g.players[0].board.close.units.map((u) => u.id).sort()).toEqual(["dead", "med"]);
    expect(ids(g.players[0].graveyard)).toEqual(["dead2"]);
    expect(g.pending).toBeNull();
    expect(g.current).toBe(1);
  });

  it("has no effect and no pause when the graveyard is empty", () => {
    const g = play(setup([medic()]), 0, "med");
    expect(g.pending).toBeNull();
    expect(g.current).toBe(1);
  });

  it("cannot revive heroes or special cards, so with only those it does not pause", () => {
    const g0 = setup([medic()]);
    g0.players[0].graveyard.push(unit("hero", 10, "close", { hero: true }), special("sc", "scorch"));
    const g = play(g0, 0, "med");
    expect(g.pending).toBeNull();
  });

  it("rejects an invalid revive choice", () => {
    const g0 = setup([medic()]);
    g0.players[0].graveyard.push(unit("dead", 5), unit("hero", 10, "close", { hero: true }), special("sc", "scorch"));
    const g = play(g0, 0, "med");
    const msg = "Choose a non-hero unit from your graveyard";
    expect(reject(g, { type: "revive", player: 0, cardId: "hero" })).toBe(msg);
    expect(reject(g, { type: "revive", player: 0, cardId: "sc" })).toBe(msg);
    expect(reject(g, { type: "revive", player: 0, cardId: "nope" })).toBe(msg);
  });

  it("rejects a revive when nothing is pending", () => {
    expect(reject(setup([]), { type: "revive", player: 0, cardId: "x" })).toBe("There is nothing to revive");
  });

  it("only revives from your own graveyard", () => {
    const g0 = setup([medic()]);
    g0.players[1].graveyard.push(unit("theirs", 9));
    const g = play(g0, 0, "med");
    expect(g.pending).toBeNull();
  });

  it("the revived unit's own abilities run: a revived spy crosses over and draws", () => {
    const g0 = setup([medic()], [], [unit("d1", 1), unit("d2", 1)]);
    g0.players[0].graveyard.push(unit("deadspy", 6, "close", { abilities: ["spy"] }));
    const handBefore = g0.players[0].hand.length;
    const g = revive(play(g0, 0, "med"), 0, "deadspy");
    expect(ids(g.players[1].board.close.units)).toEqual(["deadspy"]);
    expect(g.players[0].hand).toHaveLength(handBefore - 1 + 2);
  });

  it("a revived medic asks for another choice, and the turn ends after the last one", () => {
    const g0 = setup([medic("m1")]);
    g0.players[0].graveyard.push(medic("m2"), unit("last", 5));
    let g = revive(play(g0, 0, "m1"), 0, "m2");
    expect(g.pending).toEqual({ type: "revive", player: 0 });
    expect(g.current).toBe(0);
    g = revive(g, 0, "last");
    expect(g.pending).toBeNull();
    expect(g.current).toBe(1);
    expect(g.players[0].board.close.units.map((u) => u.id).sort()).toEqual(["last", "m1", "m2"]);
  });

  it("if the opponent has passed, you keep the turn after reviving", () => {
    const g0 = setup([], [medic()]);
    g0.players[1].graveyard.push(unit("dead", 5));
    let g = pass(g0, 0);
    g = revive(play(g, 1, "med"), 1, "dead");
    expect(g.current).toBe(1);
    expect(g.pending).toBeNull();
  });
});

describe("scorch (unit)", () => {
  const villen = () => unit("villen", 7, "close", { abilities: ["scorch"] });

  it("destroys the strongest enemy unit in its row when the enemy row totals 10 or more", () => {
    const g0 = setup([villen()]);
    g0.players[1].board.close.units.push(unit("big", 8), unit("small", 3));
    g0.players[1].board.ranged.units.push(unit("archer", 20, "ranged"));
    const g = play(g0, 0, "villen");
    expect(g.players[1].board.close.units.map((u) => u.id)).toEqual(["small"]);
    expect(ids(g.players[1].graveyard)).toEqual(["big"]);
    expect(g.players[1].board.ranged.units).toHaveLength(1);
    expect(g.players[0].board.close.units.map((u) => u.id)).toEqual(["villen"]);
  });

  it("does nothing when the enemy row totals less than 10", () => {
    const g0 = setup([villen()]);
    g0.players[1].board.close.units.push(unit("a", 5), unit("b", 4));
    const g = play(g0, 0, "villen");
    expect(g.players[1].board.close.units).toHaveLength(2);
  });

  it("destroys all units tied for strongest", () => {
    const g0 = setup([villen()]);
    g0.players[1].board.close.units.push(unit("a", 6), unit("b", 6), unit("c", 2));
    const g = play(g0, 0, "villen");
    expect(g.players[1].board.close.units.map((u) => u.id)).toEqual(["c"]);
  });

  it("heroes count towards the total but are never destroyed", () => {
    const g0 = setup([villen()]);
    g0.players[1].board.close.units.push(unit("hero", 8, "close", { hero: true }), unit("small", 3));
    const g = play(g0, 0, "villen");
    expect(g.players[1].board.close.units.map((u) => u.id)).toEqual(["hero"]);
  });

  it("uses current strength, so weather can keep the row under 10", () => {
    const g0 = setup([villen()]);
    g0.players[1].board.close.units.push(unit("a", 9), unit("b", 8));
    g0.players[1].board.close.weather = true;
    g0.players[0].board.close.weather = true;
    const g = play(g0, 0, "villen");
    expect(g.players[1].board.close.units).toHaveLength(2);
  });

  it("never hurts its own player's units", () => {
    const g0 = setup([villen()]);
    g0.players[0].board.close.units.push(unit("mine", 9));
    g0.players[1].board.close.units.push(unit("a", 6), unit("b", 5));
    const g = play(g0, 0, "villen");
    expect(g.players[0].board.close.units.map((u) => u.id).sort()).toEqual(["mine", "villen"]);
  });
});

describe("horn (unit)", () => {
  it("doubles the other units in its row but not itself", () => {
    let g = setup([unit("a", 3), unit("kaedweni", 2, "close", { abilities: ["horn"] })]);
    g = play(g, 0, "a");
    g = pass(g, 1);
    g = play(g, 0, "kaedweni");
    expect(rowPower(g.players[0].board.close)).toBe(6 + 2);
  });
});

describe("random play with every ability", () => {
  function deck(owner: string): Card[] {
    const o = (n: string) => `${owner}${n}`;
    return [
      unit(o("g1"), 3, "close", { abilities: ["muster"], muster: `${owner}gob` }),
      unit(o("g2"), 3, "close", { abilities: ["muster"], muster: `${owner}gob` }),
      unit(o("g3"), 3, "close", { abilities: ["muster"], muster: `${owner}gob` }),
      unit(o("spy1"), 6, "close", { abilities: ["spy"] }),
      unit(o("spy2"), 5, "ranged", { abilities: ["spy"] }),
      unit(o("med1"), 3, "ranged", { abilities: ["medic"] }),
      unit(o("med2"), 4, "siege", { abilities: ["medic"] }),
      unit(o("ag1"), 4, "close", { abilities: ["agile"] }),
      unit(o("ag2"), 5, "ranged", { abilities: ["agile"] }),
      unit(o("villen"), 7, "close", { abilities: ["scorch"] }),
      unit(o("horn"), 2, "siege", { abilities: ["horn"] }),
      unit(o("bond1"), 4, "ranged", { abilities: ["tightBond"], bond: `${owner}b` }),
      unit(o("bond2"), 4, "ranged", { abilities: ["tightBond"], bond: `${owner}b` }),
      unit(o("morale"), 1, "siege", { abilities: ["moraleBoost"] }),
      unit(o("hero1"), 12, "close", { hero: true }),
      unit(o("plain1"), 5),
      unit(o("plain2"), 6, "ranged"),
      unit(o("plain3"), 7, "siege"),
      special(o("hornc"), "horn"),
      special(o("decoy"), "decoy"),
      special(o("scorchc"), "scorch"),
      weather(o("frost"), "bitingFrost"),
      weather(o("storm"), "skelligeStorm"),
      weather(o("clear"), "clearWeather"),
    ];
  }

  /** Every card a player owns, wherever it currently is. Spies on the other board still count. */
  function owned(g: GameState, p: PlayerId): number {
    const me = g.players[p];
    let n = me.hand.length + me.deck.length + me.graveyard.length + me.inPlay.length;
    g.players.forEach((player, side) => {
      for (const row of ["close", "ranged", "siege"] as const) {
        for (const u of player.board[row].units) {
          if ((u.owner ?? side) === p) n += 1;
        }
      }
    });
    return n;
  }

  it("always accepts listed actions, conserves every player's cards, and finishes", () => {
    for (let seed = 1; seed <= 150; seed++) {
      const rng = seededRng(seed);
      let g = newGame({ decks: [deck("a"), deck("b")], firstPlayer: coinToss(rng), rng });
      let steps = 0;
      while (g.status === "playing") {
        const actions = legalActions(g);
        expect(actions.length).toBeGreaterThan(0);
        g = act(g, actions[Math.floor(rng() * actions.length)]!);
        expect(owned(g, 0)).toBe(24);
        expect(owned(g, 1)).toBe(24);
        expect(++steps).toBeLessThan(400);
      }
      expect([0, 1, "draw"]).toContain(g.winner);
      expect(g.pending).toBeNull();
    }
  });
});
