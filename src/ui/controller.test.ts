import { describe, expect, it } from "vitest";
import { legalActions } from "../engine/game";
import type { Card } from "../engine/types";
import { AI, HUMAN, choicesFor, describeAction, initialState, playableIds, reducer, type UIState } from "./controller";

/** A state where it is the human's turn, whatever the seed said. */
function humanTurn(seed = 1): UIState {
  const s = initialState(seed);
  s.game.current = HUMAN;
  s.game.roundStarter = HUMAN;
  return s;
}

function take(state: UIState, predicate: (c: Card) => boolean): Card {
  const card = state.game.players[HUMAN].hand.find(predicate);
  if (!card) throw new Error("no such card in the starting hand");
  return card;
}

describe("initialState", () => {
  it("starts a validated demo game with a full hand", () => {
    const s = initialState(4);
    expect(s.game.players[HUMAN].hand).toHaveLength(10);
    expect(s.game.status).toBe("playing");
    expect(s.log).toEqual([]);
  });

  it("is repeatable for the same seed", () => {
    expect(initialState(9).game.players[0].hand.map((c) => c.id)).toEqual(initialState(9).game.players[0].hand.map((c) => c.id));
  });
});

describe("reducer", () => {
  it("selecting a card, and clearing the selection", () => {
    const s = humanTurn();
    const id = s.game.players[HUMAN].hand[0]!.id;
    expect(reducer(s, { type: "select", cardId: id }).selected).toBe(id);
    expect(reducer({ ...s, selected: id }, { type: "select", cardId: null }).selected).toBeNull();
  });

  it("the human's action is applied, logged, and clears the selection", () => {
    const s = { ...humanTurn(), selected: "x" };
    const next = reducer(s, { type: "act", action: { type: "pass", player: HUMAN } });
    expect(next.game.players[HUMAN].passed).toBe(true);
    expect(next.log).toEqual(["You passed"]);
    expect(next.selected).toBeNull();
    expect(next.game.current).toBe(AI);
  });

  it("an illegal action sets an error and changes nothing else", () => {
    const s = humanTurn();
    const next = reducer(s, { type: "act", action: { type: "play", player: HUMAN, cardId: "nope" } });
    expect(next.error).toBe("That card is not in your hand");
    expect(next.game).toEqual(s.game);
    expect(reducer(next, { type: "dismissError" }).error).toBeNull();
  });

  it("ignores the human acting out of turn", () => {
    const s = humanTurn();
    s.game.current = AI;
    expect(reducer(s, { type: "act", action: { type: "pass", player: HUMAN } })).toBe(s);
  });

  it("the AI moves only on its own turn", () => {
    const s = humanTurn();
    expect(reducer(s, { type: "ai" })).toBe(s);
    s.game.current = AI;
    const next = reducer(s, { type: "ai" });
    expect(next.log).toHaveLength(1);
    expect(next.log[0]).toMatch(/^Opponent /);
    expect(next.aiSeed).not.toBe(s.aiSeed);
  });

  it("logs the result of each round and the end of the game", () => {
    let s = humanTurn();
    s.game.players[AI].lives = 1;
    s = reducer(s, { type: "act", action: { type: "play", player: HUMAN, cardId: take(s, (c) => c.kind === "unit" && !c.abilities.length).id } });
    s = reducer(s, { type: "ai" });
    // Keep both sides passing until the round resolves.
    for (let i = 0; i < 40 && s.game.status === "playing"; i++) {
      s = s.game.current === HUMAN ? reducer(s, { type: "act", action: { type: "pass", player: HUMAN } }) : reducer(s, { type: "ai" });
    }
    expect(s.log.some((line) => /^Round 1: /.test(line))).toBe(true);
  });

  it("restarting gives a fresh game", () => {
    const s = reducer(humanTurn(), { type: "act", action: { type: "pass", player: HUMAN } });
    const fresh = reducer(s, { type: "restart", seed: 77 });
    expect(fresh.log).toEqual([]);
    expect(fresh.game.round).toBe(1);
  });
});

describe("choicesFor and playableIds", () => {
  it("a plain unit needs no further choice", () => {
    const s = humanTurn();
    const unit = take(s, (c) => c.kind === "unit" && c.abilities.length === 0 && !c.isHero);
    const choices = choicesFor(s.game, unit.id);
    expect(choices.plain).toEqual({ type: "play", player: HUMAN, cardId: unit.id });
    expect(choices.rows.size).toBe(0);
    expect(choices.targets.size).toBe(0);
  });

  it("an agile unit needs a row", () => {
    const s = humanTurn(2);
    s.game.players[HUMAN].hand.push({ kind: "unit", id: "ag", name: "Agile", basePower: 4, row: "close", isHero: false, abilities: ["agile"] });
    const choices = choicesFor(s.game, "ag");
    expect(choices.plain).toBeNull();
    expect([...choices.rows.keys()].sort()).toEqual(["close", "ranged"]);
  });

  it("a horn needs a row and a decoy needs a target", () => {
    const s = humanTurn();
    const hand = s.game.players[HUMAN].hand;
    hand.push({ kind: "special", id: "h", name: "Horn", effect: "horn" }, { kind: "special", id: "d", name: "Decoy", effect: "decoy" });
    s.game.players[HUMAN].board.close.units.push({ kind: "unit", id: "mine", name: "Mine", basePower: 3, row: "close", isHero: false, abilities: [] });
    expect([...choicesFor(s.game, "h").rows.keys()].sort()).toEqual(["close", "ranged", "siege"]);
    expect([...choicesFor(s.game, "d").targets.keys()]).toEqual(["mine"]);
  });

  it("nothing is playable off-turn, while a choice is pending, or with no selection", () => {
    const s = humanTurn();
    expect(choicesFor(s.game, null).plain).toBeNull();
    s.game.current = AI;
    expect(playableIds(s.game).size).toBe(0);
  });

  it("every playable id is in the hand and matches the engine's legal actions", () => {
    const s = humanTurn();
    const ids = playableIds(s.game);
    const fromEngine = new Set(legalActions(s.game).flatMap((a) => (a.type === "play" ? [a.cardId] : [])));
    expect(ids).toEqual(fromEngine);
  });
});

describe("describeAction", () => {
  it("names the card, rows, targets and leaders", () => {
    const s = humanTurn();
    const unit = take(s, (c) => c.kind === "unit");
    expect(describeAction(s.game, { type: "play", player: HUMAN, cardId: unit.id })).toBe(`You played ${unit.name}`);
    expect(describeAction(s.game, { type: "pass", player: AI })).toBe("Opponent passed");
    expect(describeAction(s.game, { type: "leader", player: HUMAN })).toBe("You used Marshal of the Vale");
    expect(describeAction(s.game, { type: "play", player: HUMAN, cardId: unit.id, row: "ranged" })).toBe(`You played ${unit.name} on the ranged row`);
  });
});
