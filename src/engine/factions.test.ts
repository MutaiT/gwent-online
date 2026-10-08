import { describe, expect, it } from "vitest";
import { applyAction, legalActions, newGame, type Action, type GameState, type PlayerId } from "./game";
import { seededRng } from "./rng";
import { boardPower, rowPower } from "./scoring";
import type { Ability, Card, Faction, Leader, RowName, SpecialCard, UnitCard, WeatherType } from "./types";

function unit(id: string, basePower: number, row: RowName = "close", opts: { hero?: boolean; abilities?: Ability[] } = {}): UnitCard {
  return { kind: "unit", id, name: id, basePower, row, isHero: opts.hero ?? false, abilities: opts.abilities ?? [] };
}
const special = (id: string, effect: "horn" | "decoy" | "scorch"): SpecialCard => ({ kind: "special", id, name: id, effect });
const weatherCard = (id: string, w: WeatherType): SpecialCard => ({ kind: "special", id, name: id, effect: "weather", weather: w });

function filler(owner: string): Card[] {
  return Array.from({ length: 14 }, (_, i) => unit(`${owner}f${i}`, 1));
}

interface Setup {
  factions?: [Faction | null, Faction | null];
  leaders?: [Leader | null, Leader | null];
  firstPlayer?: PlayerId;
  seed?: number;
}

/** Player 0 starts unless told otherwise. Extra cards go on top of each hand. */
function setup(extra: Setup = {}, hand0: Card[] = [], hand1: Card[] = []): GameState {
  const g = newGame({
    decks: [filler("a"), filler("b")],
    firstPlayer: "firstPlayer" in extra ? extra.firstPlayer : 0,
    rng: seededRng(extra.seed ?? 1),
    factions: extra.factions,
    leaders: extra.leaders,
  });
  g.players[0].hand = [...hand0, ...g.players[0].hand];
  g.players[1].hand = [...hand1, ...g.players[1].hand];
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
const useLeader = (g: GameState, player: PlayerId) => act(g, { type: "leader", player });
const ids = (cards: readonly Card[]) => cards.map((c) => c.id);

describe("Nilfgaard", () => {
  it("wins a round that ends level", () => {
    let g = setup({ factions: ["nilfgaard", null] });
    g = pass(pass(g, 0), 1);
    expect(g.rounds[0]!.winner).toBe(0);
    expect(g.players[0].lives).toBe(2);
    expect(g.players[1].lives).toBe(1);
  });

  it("works for either seat", () => {
    let g = setup({ factions: [null, "nilfgaard"] });
    g = pass(pass(g, 0), 1);
    expect(g.rounds[0]!.winner).toBe(1);
    expect(g.players[0].lives).toBe(1);
  });

  it("two Nilfgaard players still draw", () => {
    let g = setup({ factions: ["nilfgaard", "nilfgaard"] });
    g = pass(pass(g, 0), 1);
    expect(g.rounds[0]!.winner).toBe("draw");
    expect(g.players[0].lives).toBe(1);
    expect(g.players[1].lives).toBe(1);
  });

  it("does not help when they actually lose", () => {
    let g = setup({ factions: ["nilfgaard", null] }, [], [unit("big", 5)]);
    g = pass(g, 0);
    g = play(g, 1, "big");
    g = pass(g, 1);
    expect(g.rounds[0]!.winner).toBe(1);
    expect(g.players[0].lives).toBe(1);
  });

  it("a tie between non-Nilfgaard players is still a draw", () => {
    let g = pass(pass(setup({ factions: ["monsters", "skellige"] }), 0), 1);
    expect(g.rounds[0]!.winner).toBe("draw");
    g = setup();
    expect(pass(pass(g, 0), 1).rounds[0]!.winner).toBe("draw");
  });
});

describe("Northern Realms", () => {
  it("draw a card after winning a round", () => {
    let g = setup({ factions: ["northernRealms", null] }, [unit("u", 5)]);
    g = play(g, 0, "u");
    g = pass(g, 1);
    const handBefore = g.players[0].hand.length;
    const deckBefore = g.players[0].deck.length;
    g = pass(g, 0);
    expect(g.rounds[0]!.winner).toBe(0);
    expect(g.players[0].hand).toHaveLength(handBefore + 1);
    expect(g.players[0].deck).toHaveLength(deckBefore - 1);
  });

  it("do not draw after losing", () => {
    let g = setup({ factions: [null, "northernRealms"] }, [unit("u", 5)]);
    g = play(g, 0, "u");
    g = pass(g, 1);
    const handBefore = g.players[1].hand.length;
    g = pass(g, 0);
    expect(g.players[1].hand).toHaveLength(handBefore);
  });

  it("do not draw after a draw", () => {
    let g = setup({ factions: ["northernRealms", "northernRealms"] });
    const handBefore = g.players[0].hand.length;
    g = pass(pass(g, 0), 1);
    expect(g.rounds[0]!.winner).toBe("draw");
    expect(g.players[0].hand).toHaveLength(handBefore);
  });

  it("cope with an empty deck", () => {
    let g = setup({ factions: ["northernRealms", null] }, [unit("u", 5)]);
    g.players[0].deck = [];
    g = pass(play(g, 0, "u"), 1);
    g = pass(g, 0);
    expect(g.rounds[0]!.winner).toBe(0);
  });
});

describe("Scoia'tael", () => {
  it("one Scoia'tael player gets to choose who goes first", () => {
    const g = setup({ factions: [null, "scoiatael"], firstPlayer: undefined });
    expect(g.pending).toEqual({ type: "chooseFirst", player: 1 });
    expect(g.current).toBe(1);
    expect(reject(g, { type: "pass", player: 1 })).toBe("Choose who goes first");
    expect(legalActions(g)).toEqual([
      { type: "chooseFirst", player: 1, first: 0 },
      { type: "chooseFirst", player: 1, first: 1 },
    ]);
  });

  it("the choice sets who starts, now and as the round starter", () => {
    let g = setup({ factions: [null, "scoiatael"], firstPlayer: undefined });
    g = act(g, { type: "chooseFirst", player: 1, first: 0 });
    expect(g.pending).toBeNull();
    expect(g.current).toBe(0);
    expect(g.roundStarter).toBe(0);
    g = pass(g, 0);
    expect(g.current).toBe(1);
  });

  it("they may choose themselves", () => {
    const g = act(setup({ factions: ["scoiatael", null], firstPlayer: undefined }), {
      type: "chooseFirst",
      player: 0,
      first: 0,
    });
    expect(g.current).toBe(0);
  });

  it("only the Scoia'tael player may choose", () => {
    const g = setup({ factions: [null, "scoiatael"], firstPlayer: undefined });
    expect(reject(g, { type: "chooseFirst", player: 0, first: 0 })).toBe("It is not your turn");
  });

  it("two Scoia'tael, or none, means a coin toss with no choice", () => {
    expect(setup({ factions: ["scoiatael", "scoiatael"], firstPlayer: undefined }).pending).toBeNull();
    expect(setup({ factions: [null, null], firstPlayer: undefined }).pending).toBeNull();
  });

  it("an explicit first player overrides the choice", () => {
    expect(setup({ factions: [null, "scoiatael"], firstPlayer: 0 }).pending).toBeNull();
  });

  it("cannot choose when nothing is pending", () => {
    expect(reject(setup(), { type: "chooseFirst", player: 0, first: 1 })).toBe("Nobody needs to choose who goes first");
  });
});

describe("Monsters", () => {
  /** Player 0 (Monsters) ends round 1 with units a, b and c on the board. */
  function roundEnd(seed: number): GameState {
    let g = setup({ factions: ["monsters", null], seed }, [unit("a", 3), unit("b", 4), unit("c", 5)]);
    g = play(g, 0, "a");
    g = pass(g, 1);
    g = play(g, 0, "b");
    g = play(g, 0, "c");
    return pass(g, 0);
  }

  it("keep exactly one of their own units on the board; the rest go to the graveyard", () => {
    const g = roundEnd(1);
    const kept = g.players[0].board.close.units.map((u) => u.id);
    expect(kept).toHaveLength(1);
    expect(["a", "b", "c"]).toContain(kept[0]);
    expect(ids(g.players[0].graveyard).sort()).toEqual(["a", "b", "c"].filter((id) => id !== kept[0]));
    expect(g.round).toBe(2);
  });

  it("the kept unit scores in the next round", () => {
    const g = roundEnd(1);
    expect(boardPower(g.players[0].board)).toBe(g.players[0].board.close.units[0]!.basePower);
  });

  it("the choice is random across games but repeatable for one seed", () => {
    const chosen = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) chosen.add(roundEnd(seed).players[0].board.close.units[0]!.id);
    expect([...chosen].sort()).toEqual(["a", "b", "c"]);
    expect(roundEnd(7).players[0].board.close.units[0]!.id).toBe(roundEnd(7).players[0].board.close.units[0]!.id);
  });

  it("the opponent keeps nothing", () => {
    expect(roundEnd(1).players[1].board.close.units).toEqual([]);
  });

  it("do nothing when their board is empty", () => {
    const g = pass(pass(setup({ factions: ["monsters", null] }), 0), 1);
    expect(g.players[0].board.close.units).toEqual([]);
  });

  it("never keep a spy the opponent played onto their side", () => {
    const spy = unit("spy", 6, "close", { abilities: ["spy"] });
    let g = setup({ factions: ["monsters", null] }, [], [spy]);
    g = pass(g, 0);
    g = play(g, 1, "spy");
    expect(ids(g.players[0].board.close.units)).toEqual(["spy"]);
    g = pass(g, 1);
    expect(g.players[0].board.close.units).toEqual([]);
    expect(ids(g.players[0].graveyard)).toEqual(["spy"]);
  });

  it("keep their own unit, never the enemy spy sitting beside it", () => {
    const spy = unit("spy", 9, "close", { abilities: ["spy"] });
    for (let seed = 1; seed <= 30; seed++) {
      let g = setup({ factions: ["monsters", null], seed }, [unit("mine", 3)], [spy]);
      g = play(g, 0, "mine");
      g = play(g, 1, "spy");
      g = pass(g, 0);
      g = pass(g, 1);
      expect(ids(g.players[0].board.close.units)).toEqual(["mine"]);
    }
  });

  it("do not keep a unit when the game ends", () => {
    let g = setup({ factions: ["monsters", null] }, [unit("a", 5)]);
    g.players[1].lives = 1;
    g = pass(play(g, 0, "a"), 1);
    g = pass(g, 0);
    expect(g.status).toBe("finished");
    expect(g.players[0].board.close.units).toEqual([]);
  });
});

describe("Skellige", () => {
  /** Round 2 is lost by player 0 (Skellige), so round 3 starts. Their graveyard is preset. */
  function toRoundThree(graveyard: Card[], seed = 1): GameState {
    let g = setup({ factions: ["skellige", null], seed }, [], [unit("t", 4)]);
    g.round = 2;
    g.players[1].lives = 1;
    g.players[0].graveyard = graveyard;
    g = pass(g, 0);
    g = play(g, 1, "t");
    return pass(g, 1);
  }
  const dead = () => [unit("d1", 2), unit("d2", 3), unit("d3", 4), unit("hero", 9, "close", { hero: true }), special("sc", "scorch")];

  it("two random units come back from the graveyard at the start of round 3", () => {
    const g = toRoundThree(dead());
    expect(g.round).toBe(3);
    const back = g.players[0].board.close.units.map((u) => u.id);
    expect(back).toHaveLength(2);
    for (const id of back) expect(["d1", "d2", "d3"]).toContain(id);
    expect(new Set(back).size).toBe(2);
    expect(g.players[0].graveyard).toHaveLength(3);
  });

  it("never brings back heroes or special cards", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const g = toRoundThree(dead(), seed);
      expect(g.players[0].board.close.units.some((u) => u.id === "hero")).toBe(false);
      expect(ids(g.players[0].graveyard)).toContain("hero");
      expect(ids(g.players[0].graveyard)).toContain("sc");
    }
  });

  it("brings back what it can when fewer than two units are available", () => {
    const g = toRoundThree([unit("only", 5), unit("hero", 9, "close", { hero: true })]);
    expect(g.players[0].board.close.units.map((u) => u.id)).toEqual(["only"]);
  });

  it("does not trigger at the start of round 2", () => {
    let g = setup({ factions: ["skellige", null] }, [unit("u", 5)]);
    g = pass(play(g, 0, "u"), 1);
    g = pass(g, 0);
    expect(g.round).toBe(2);
    expect(g.players[0].board.close.units).toEqual([]);
  });

  it("the returned units score", () => {
    const g = toRoundThree([unit("d1", 6), unit("d2", 7)]);
    expect(boardPower(g.players[0].board)).toBe(13);
  });
});

describe("leaders", () => {
  const hornLeader = (row: RowName = "siege"): Leader => ({ id: "l", name: "Horn leader", effect: { type: "horn", row } });
  const weatherLeader = (weather: WeatherType): Leader => ({ id: "l", name: "Weather leader", effect: { type: "weather", weather } });
  const scorchLeader = (row: RowName = "close"): Leader => ({ id: "l", name: "Scorch leader", effect: { type: "scorchRow", row } });

  it("a horn leader doubles its row, then passes the turn", () => {
    const g0 = setup({ leaders: [hornLeader("siege"), null] });
    g0.players[0].board.siege.units.push(unit("c", 5, "siege"));
    const g = useLeader(g0, 0);
    expect(g.players[0].board.siege.hornCard).toBe(true);
    expect(rowPower(g.players[0].board.siege)).toBe(10);
    expect(g.players[0].leaderUsed).toBe(true);
    expect(g.current).toBe(1);
  });

  it("can only be used once per match, even in a later round", () => {
    let g = useLeader(setup({ leaders: [hornLeader(), null] }), 0);
    expect(reject(pass(g, 1), { type: "leader", player: 0 })).toBe("Your leader has already been used");
    g = pass(pass(g, 1), 0);
    expect(g.round).toBe(2);
    expect(reject(g, { type: "leader", player: g.current })).toMatch(/already been used|no leader/);
    expect(g.players[0].leaderUsed).toBe(true);
  });

  it("is rejected without a leader", () => {
    expect(reject(setup(), { type: "leader", player: 0 })).toBe("You have no leader");
  });

  it("a horn leader is rejected on a row that already has a horn, and stays unused", () => {
    const g0 = setup({ leaders: [hornLeader("siege"), null] });
    g0.players[0].board.siege.hornCard = true;
    expect(reject(g0, { type: "leader", player: 0 })).toBe("That row already has a horn");
    expect(g0.players[0].leaderUsed).toBe(false);
    expect(legalActions(g0).some((a) => a.type === "leader")).toBe(false);
  });

  it("a horn leader's effect ends with the round", () => {
    let g = useLeader(setup({ leaders: [hornLeader("siege"), null] }), 0);
    g = pass(pass(g, 1), 0);
    expect(g.players[0].board.siege.hornCard).toBe(false);
  });

  it("a weather leader puts weather on both sides, and Clear Weather removes it", () => {
    let g = useLeader(setup({ leaders: [weatherLeader("bitingFrost"), weatherLeader("clearWeather")] }), 0);
    expect(g.players[0].board.close.weather).toBe(true);
    expect(g.players[1].board.close.weather).toBe(true);
    g = useLeader(g, 1);
    expect(g.players[0].board.close.weather).toBe(false);
    expect(g.players[1].board.close.weather).toBe(false);
  });

  it("a Clear Weather leader sends weather cards in play to the graveyard", () => {
    let g = setup({ leaders: [null, weatherLeader("clearWeather")] }, [weatherCard("frost", "bitingFrost")]);
    g = play(g, 0, "frost");
    g = useLeader(g, 1);
    expect(g.players[0].inPlay).toEqual([]);
    expect(ids(g.players[0].graveyard)).toEqual(["frost"]);
  });

  it("a scorch leader destroys the strongest enemy unit in its row when they total 10 or more", () => {
    const g0 = setup({ leaders: [scorchLeader("close"), null] });
    g0.players[1].board.close.units.push(unit("big", 8), unit("small", 4));
    const g = useLeader(g0, 0);
    expect(g.players[1].board.close.units.map((u) => u.id)).toEqual(["small"]);
    expect(ids(g.players[1].graveyard)).toEqual(["big"]);
    expect(g.players[0].leaderUsed).toBe(true);
  });

  it("a scorch leader under the threshold does nothing, but is still used", () => {
    const g0 = setup({ leaders: [scorchLeader("close"), null] });
    g0.players[1].board.close.units.push(unit("a", 5), unit("b", 4));
    const g = useLeader(g0, 0);
    expect(g.players[1].board.close.units).toHaveLength(2);
    expect(g.players[0].leaderUsed).toBe(true);
  });

  it("cannot be used while a medic choice is pending", () => {
    const g0 = setup({ leaders: [hornLeader(), null] }, [unit("m", 2, "close", { abilities: ["medic"] })]);
    g0.players[0].graveyard.push(unit("dead", 4));
    const g = play(g0, 0, "m");
    expect(reject(g, { type: "leader", player: 0 })).toBe("Choose a unit to revive first");
  });

  it("is listed in legal actions only while available", () => {
    const g = setup({ leaders: [hornLeader(), null] });
    expect(legalActions(g).some((a) => a.type === "leader")).toBe(true);
    expect(legalActions(useLeader(pass(setup({ leaders: [null, hornLeader()] }), 0), 1)).some((a) => a.type === "leader")).toBe(false);
  });

  it("if the opponent has passed, using a leader keeps the turn", () => {
    const g = useLeader(pass(setup({ leaders: [null, hornLeader()] }), 0), 1);
    expect(g.current).toBe(1);
  });
});

describe("leaders that use the deck or the graveyards", () => {
  const frostFromDeck: Leader = { id: "fl", name: "Frost leader", effect: { type: "playWeather", weather: "bitingFrost" } };
  const shuffler: Leader = { id: "sl", name: "Shuffle leader", effect: { type: "shuffleGraveyards" } };

  it("plays a weather card of that kind from your deck and keeps it in play until the round ends", () => {
    const g0 = setup({ leaders: [frostFromDeck, null] });
    g0.players[0].deck = [unit("x", 1), weatherCard("frost", "bitingFrost"), weatherCard("fog", "impenetrableFog")];
    const g = useLeader(g0, 0);
    expect(g.players[0].board.close.weather).toBe(true);
    expect(g.players[1].board.close.weather).toBe(true);
    expect(ids(g.players[0].deck)).toEqual(["x", "fog"]);
    expect(ids(g.players[0].inPlay)).toEqual(["frost"]);
    expect(g.players[0].leaderUsed).toBe(true);
    expect(g.current).toBe(1);
  });

  it("only takes the matching weather, and the first one if there are several", () => {
    const g0 = setup({ leaders: [frostFromDeck, null] });
    g0.players[0].deck = [weatherCard("f1", "bitingFrost"), weatherCard("f2", "bitingFrost")];
    const g = useLeader(g0, 0);
    expect(ids(g.players[0].deck)).toEqual(["f2"]);
  });

  it("cannot be used when the deck has no such card, is not offered, and stays unused", () => {
    const g0 = setup({ leaders: [frostFromDeck, null] });
    g0.players[0].deck = [weatherCard("fog", "impenetrableFog")];
    expect(reject(g0, { type: "leader", player: 0 })).toBe("That weather card is not in your deck");
    expect(legalActions(g0).some((a) => a.type === "leader")).toBe(false);
    expect(g0.players[0].leaderUsed).toBe(false);
  });

  it("a Clear Weather leader card from the deck clears the weather and goes to the graveyard", () => {
    const clear: Leader = { id: "cl", name: "Clear", effect: { type: "playWeather", weather: "clearWeather" } };
    const g0 = setup({ leaders: [clear, null] });
    g0.players[0].deck = [weatherCard("c1", "clearWeather")];
    g0.players[1].board.close.weather = true;
    const g = useLeader(g0, 0);
    expect(g.players[1].board.close.weather).toBe(false);
    expect(ids(g.players[0].graveyard)).toEqual(["c1"]);
  });

  it("shuffles both graveyards back into the decks", () => {
    const g0 = setup({ leaders: [shuffler, null] });
    g0.players[0].graveyard = [unit("a1", 3), unit("a2", 4)];
    g0.players[1].graveyard = [unit("b1", 5)];
    const decks = [g0.players[0].deck.length, g0.players[1].deck.length];
    const g = useLeader(g0, 0);
    expect(g.players[0].graveyard).toEqual([]);
    expect(g.players[1].graveyard).toEqual([]);
    expect(g.players[0].deck).toHaveLength(decks[0]! + 2);
    expect(g.players[1].deck).toHaveLength(decks[1]! + 1);
    expect(ids(g.players[0].deck)).toEqual(expect.arrayContaining(["a1", "a2"]));
    expect(ids(g.players[1].deck)).toContain("b1");
  });

  it("shuffling is repeatable for the same seed", () => {
    const run = () => {
      const g0 = setup({ leaders: [shuffler, null], seed: 9 });
      g0.players[0].graveyard = [unit("a1", 3), unit("a2", 4), unit("a3", 5)];
      return ids(useLeader(g0, 0).players[0].deck).join(",");
    };
    expect(run()).toBe(run());
  });
});

describe("heroes still give morale and horn", () => {
  it("a hero with morale boost raises the other units in its row but not itself", () => {
    const kayran: UnitCard = { ...unit("kayran", 8, "close", { hero: true, abilities: ["moraleBoost"] }) };
    const g0 = setup({}, [kayran, unit("w", 5)]);
    let g = play(g0, 0, "kayran");
    g = pass(g, 1);
    g = play(g, 0, "w");
    expect(rowPower(g.players[0].board.close)).toBe(8 + 6);
  });

  it("a hero with the horn ability doubles the others but not itself", () => {
    const hero: UnitCard = { ...unit("hh", 6, "close", { hero: true, abilities: ["horn"] }) };
    const g0 = setup({}, [hero, unit("w", 5)]);
    let g = play(g0, 0, "hh");
    g = pass(g, 1);
    g = play(g, 0, "w");
    expect(rowPower(g.players[0].board.close)).toBe(6 + 10);
  });
});

describe("random play with factions and leaders", () => {
  function deck(owner: string): Card[] {
    const o = (n: string) => `${owner}${n}`;
    return [
      unit(o("spy1"), 6, "close", { abilities: ["spy"] }),
      unit(o("spy2"), 5, "ranged", { abilities: ["spy"] }),
      unit(o("med1"), 3, "ranged", { abilities: ["medic"] }),
      unit(o("med2"), 4, "siege", { abilities: ["medic"] }),
      unit(o("ag1"), 4, "close", { abilities: ["agile"] }),
      unit(o("villen"), 7, "close", { abilities: ["scorch"] }),
      unit(o("horn"), 2, "siege", { abilities: ["horn"] }),
      unit(o("hero1"), 12, "close", { hero: true }),
      ...Array.from({ length: 10 }, (_, i) => unit(o(`p${i}`), (i % 7) + 1, (["close", "ranged", "siege"] as const)[i % 3])),
      special(o("hornc"), "horn"),
      special(o("decoy"), "decoy"),
      special(o("scorchc"), "scorch"),
      weatherCard(o("frost"), "bitingFrost"),
      weatherCard(o("clear"), "clearWeather"),
    ];
  }
  const FACTIONS: (Faction | null)[] = ["northernRealms", "nilfgaard", "scoiatael", "monsters", "skellige", null];
  const LEADERS: (Leader | null)[] = [
    null,
    { id: "h", name: "h", effect: { type: "horn", row: "siege" } },
    { id: "w", name: "w", effect: { type: "weather", weather: "torrentialRain" } },
    { id: "c", name: "c", effect: { type: "weather", weather: "clearWeather" } },
    { id: "s", name: "s", effect: { type: "scorchRow", row: "close" } },
  ];

  function everyCard(g: GameState): number {
    let n = 0;
    for (const p of g.players) {
      n += p.hand.length + p.deck.length + p.graveyard.length + p.inPlay.length;
      for (const row of ["close", "ranged", "siege"] as const) n += p.board[row].units.length;
    }
    return n;
  }

  it("never rejects a listed action, never loses a card, and always finishes", () => {
    const pick = <T,>(items: T[], rng: () => number): T => items[Math.floor(rng() * items.length)] as T;
    for (let seed = 1; seed <= 200; seed++) {
      const rng = seededRng(seed);
      const total = deck("a").length + deck("b").length;
      let g = newGame({
        decks: [deck("a"), deck("b")],
        rng,
        factions: [pick(FACTIONS, rng), pick(FACTIONS, rng)],
        leaders: [pick(LEADERS, rng), pick(LEADERS, rng)],
      });
      let steps = 0;
      while (g.status === "playing") {
        const actions = legalActions(g);
        expect(actions.length).toBeGreaterThan(0);
        g = act(g, pick(actions, rng));
        expect(everyCard(g)).toBe(total);
        expect(++steps).toBeLessThan(500);
      }
      expect([0, 1, "draw"]).toContain(g.winner);
      expect(g.pending).toBeNull();
    }
  });
});
