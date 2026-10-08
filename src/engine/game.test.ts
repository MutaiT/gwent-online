import { describe, expect, it } from "vitest";
import {
  applyAction,
  coinToss,
  legalActions,
  newGame,
  other,
  type Action,
  type GameState,
  type PlayerId,
} from "./game";
import { seededRng, shuffle } from "./rng";
import type { RowName, UnitCard } from "./types";

function card(id: string, basePower: number, row: RowName = "close"): UnitCard {
  return { kind: "unit", id, name: id, basePower, row, isHero: false, abilities: [] };
}

/** 14 cards per player; ids are prefixed by owner so they never collide. */
function deck(owner: string, power = 5): UnitCard[] {
  return Array.from({ length: 14 }, (_, i) => card(`${owner}${i}`, power, (["close", "ranged", "siege"] as const)[i % 3]));
}

function start(firstPlayer: PlayerId = 0, seed = 1): GameState {
  return newGame({ decks: [deck("a"), deck("b")], firstPlayer, rng: seededRng(seed) });
}

/** Applies an action and fails the test if it was rejected. */
function act(state: GameState, action: Action): GameState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`Unexpected rejection: ${result.error}`);
  return result.state;
}

const play = (state: GameState, player: PlayerId, index = 0): GameState =>
  act(state, { type: "play", player, cardId: state.players[player].hand[index]!.id });
const pass = (state: GameState, player: PlayerId): GameState => act(state, { type: "pass", player });

describe("rng", () => {
  it("is repeatable for the same seed", () => {
    const a = seededRng(42);
    const b = seededRng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("shuffle keeps every item and does not change the input", () => {
    const input = [1, 2, 3, 4, 5, 6];
    const out = shuffle(input, seededRng(7));
    expect([...out].sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("coin toss returns a valid player", () => {
    expect([0, 1]).toContain(coinToss(seededRng(3)));
  });
});

describe("new game", () => {
  it("deals 10 cards each, keeps the rest in the deck, and gives two lives", () => {
    const g = start();
    for (const p of g.players) {
      expect(p.hand).toHaveLength(10);
      expect(p.deck).toHaveLength(4);
      expect(p.lives).toBe(2);
      expect(p.passed).toBe(false);
    }
    expect(g.round).toBe(1);
    expect(g.status).toBe("playing");
  });

  it("starts with the chosen first player", () => {
    expect(start(1).current).toBe(1);
  });

  it("deals the same hands for the same seed", () => {
    expect(start(0, 5).players[0].hand.map((c) => c.id)).toEqual(start(0, 5).players[0].hand.map((c) => c.id));
  });

  it("rejects a deck that is too small", () => {
    expect(() => newGame({ decks: [[card("x", 1)], deck("b")], firstPlayer: 0, rng: seededRng(1) })).toThrow(RangeError);
  });
});

describe("playing cards", () => {
  it("moves the card from hand to its row and passes the turn", () => {
    const g = start(0);
    const played = g.players[0].hand[0] as UnitCard;
    const next = play(g, 0);
    expect(next.players[0].hand).toHaveLength(9);
    expect(next.players[0].board[played.row].units.map((c) => c.id)).toContain(played.id);
    expect(next.current).toBe(1);
  });

  it("rejects a play out of turn", () => {
    const g = start(0);
    const r = applyAction(g, { type: "play", player: 1, cardId: g.players[1].hand[0]!.id });
    expect(r).toEqual({ ok: false, error: "It is not your turn" });
  });

  it("rejects a card that is not in the hand", () => {
    const r = applyAction(start(0), { type: "play", player: 0, cardId: "nope" });
    expect(r).toEqual({ ok: false, error: "That card is not in your hand" });
  });

  it("rejects playing a card twice", () => {
    const g = start(0);
    const id = g.players[0].hand[0]!.id;
    const after = act(act(g, { type: "play", player: 0, cardId: id }), { type: "pass", player: 1 });
    expect(applyAction(after, { type: "play", player: 0, cardId: id }).ok).toBe(false);
  });

  it("does not modify the state it was given", () => {
    const g = start(0);
    const snapshot = structuredClone(g);
    play(g, 0);
    expect(g).toEqual(snapshot);
  });
});

describe("passing", () => {
  it("marks the player as passed and gives the turn to the opponent", () => {
    const next = pass(start(0), 0);
    expect(next.players[0].passed).toBe(true);
    expect(next.current).toBe(1);
  });

  it("lets the other player keep playing after an opponent passes", () => {
    let g = pass(start(0), 0);
    g = play(g, 1);
    expect(g.current).toBe(1);
    g = play(g, 1);
    expect(g.current).toBe(1);
  });
});

describe("ending a round", () => {
  /** Player 0 plays one card (5), player 1 plays nothing, both pass. Player 0 wins. */
  function roundWonByZero(): GameState {
    let g = start(0);
    g = play(g, 0);
    g = pass(g, 1);
    return pass(g, 0);
  }

  it("the higher score wins and the loser loses a life", () => {
    const g = roundWonByZero();
    expect(g.rounds[0]).toEqual({ round: 1, scores: [5, 0], winner: 0 });
    expect(g.players[0].lives).toBe(2);
    expect(g.players[1].lives).toBe(1);
  });

  it("moves the board to the graveyard and resets passes", () => {
    const g = roundWonByZero();
    expect(g.players[0].graveyard).toHaveLength(1);
    expect(g.players[0].board.close.units).toHaveLength(0);
    expect(g.players.every((p) => !p.passed)).toBe(true);
  });

  it("keeps the remaining hand for the next round", () => {
    expect(roundWonByZero().players[0].hand).toHaveLength(9);
  });

  it("starts round 2 with the round winner", () => {
    const g = roundWonByZero();
    expect(g.round).toBe(2);
    expect(g.current).toBe(0);
  });

  it("the round winner starts the next round even if the opponent started this one", () => {
    let g = start(1); // player 1 starts round 1
    g = pass(g, 1);
    g = play(g, 0); // player 1 has passed, so player 0 keeps the turn
    g = pass(g, 0);
    expect(g.rounds[0]!.winner).toBe(0);
    expect(g.current).toBe(0);
  });

  it("a draw costs both players a life", () => {
    let g = start(0);
    g = pass(g, 0);
    g = pass(g, 1);
    expect(g.rounds[0]!.winner).toBe("draw");
    expect(g.players[0].lives).toBe(1);
    expect(g.players[1].lives).toBe(1);
    expect(g.status).toBe("playing");
  });

  it("after a draw the same player starts again", () => {
    let g = start(1);
    g = pass(g, 1);
    g = pass(g, 0);
    expect(g.current).toBe(1);
  });
});

describe("finishing the game", () => {
  /** Player 0 wins a round by playing one card while player 1 passes. */
  function zeroWinsRound(g: GameState): GameState {
    let s = play(g, 0);
    s = pass(s, 1);
    return pass(s, 0);
  }

  it("ends in two rounds when one player wins both", () => {
    let g = zeroWinsRound(start(0));
    expect(g.status).toBe("playing");
    g = zeroWinsRound(g);
    expect(g.status).toBe("finished");
    expect(g.winner).toBe(0);
    expect(g.players[1].lives).toBe(0);
  });

  it("goes to a third round when the rounds are split", () => {
    let g = zeroWinsRound(start(0));
    // Round 2: player 0 starts as the winner, so passes; player 1 plays and wins.
    g = pass(g, 0);
    g = play(g, 1);
    g = pass(g, 1);
    expect(g.rounds[1]!.winner).toBe(1);
    expect(g.status).toBe("playing");
    expect(g.round).toBe(3);
  });

  it("is a draw when both players run out of lives together", () => {
    let g = start(0);
    g = pass(g, 0);
    g = pass(g, 1); // draw: 1 life each
    g = pass(g, 0); // after a draw the same player starts round 2
    g = pass(g, 1); // draw again: 0 lives each
    expect(g.status).toBe("finished");
    expect(g.winner).toBe("draw");
  });

  it("rejects further actions once finished", () => {
    let g = zeroWinsRound(start(0));
    g = zeroWinsRound(g);
    expect(applyAction(g, { type: "pass", player: g.current })).toEqual({ ok: false, error: "The game is over" });
    expect(legalActions(g)).toEqual([]);
  });
});

describe("legal actions", () => {
  it("lists a play for every card in hand, plus pass", () => {
    const g = start(0);
    const actions = legalActions(g);
    expect(actions).toHaveLength(11);
    expect(actions.at(-1)).toEqual({ type: "pass", player: 0 });
    expect(actions.every((a) => a.player === 0)).toBe(true);
  });

  it("every listed action is accepted by applyAction", () => {
    const g = start(1);
    for (const action of legalActions(g)) {
      expect(applyAction(g, action).ok).toBe(true);
    }
  });

  it("a player with an empty hand can still pass", () => {
    const g = start(0);
    g.players[0].hand = [];
    expect(legalActions(g)).toEqual([{ type: "pass", player: 0 }]);
  });
});

describe("helpers", () => {
  it("other() flips the player", () => {
    expect(other(0)).toBe(1);
    expect(other(1)).toBe(0);
  });
});

describe("random play", () => {
  function totalCards(state: GameState, player: PlayerId): number {
    const p = state.players[player];
    const onBoard = (["close", "ranged", "siege"] as const).reduce((n, row) => n + p.board[row].units.length, 0);
    return p.hand.length + p.deck.length + p.graveyard.length + p.inPlay.length + onBoard;
  }

  it("always finishes, never loses or duplicates a card, and has a valid winner", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const rng = seededRng(seed);
      let g = newGame({ decks: [deck("a"), deck("b")], firstPlayer: coinToss(rng), rng });
      let steps = 0;
      while (g.status === "playing") {
        const actions = legalActions(g);
        const action = actions[Math.floor(rng() * actions.length)]!;
        g = act(g, action);
        expect(totalCards(g, 0)).toBe(14);
        expect(totalCards(g, 1)).toBe(14);
        expect(++steps).toBeLessThan(200);
      }
      expect(g.rounds.length).toBeGreaterThanOrEqual(2);
      expect(g.rounds.length).toBeLessThanOrEqual(3);
      expect([0, 1, "draw"]).toContain(g.winner);
    }
  });
});
