import { shuffle, type Rng } from "./rng";
import { boardPower, unitPower } from "./scoring";
import {
  WEATHER_ROWS,
  emptyBoard,
  type Board,
  type Card,
  type RowName,
  type SpecialCard,
  type UnitCard,
} from "./types";

export type PlayerId = 0 | 1;

const ROW_NAMES: RowName[] = ["close", "ranged", "siege"];

export interface PlayerState {
  deck: Card[];
  hand: Card[];
  graveyard: Card[];
  board: Board;
  /** Special cards that stay on the table until the round ends (weather, horn, decoy). */
  inPlay: SpecialCard[];
  lives: number;
  /** Has passed in the current round and takes no more turns until it ends. */
  passed: boolean;
}

export interface RoundResult {
  round: number;
  scores: [number, number];
  /** The winning player, or "draw" when scores were level. */
  winner: PlayerId | "draw";
}

export interface GameState {
  players: [PlayerState, PlayerState];
  round: number;
  /** Whose turn it is. */
  current: PlayerId;
  roundStarter: PlayerId;
  rounds: RoundResult[];
  status: "playing" | "finished";
  /** Set once the game is finished. */
  winner: PlayerId | "draw" | null;
}

export type Action =
  | {
      type: "play";
      player: PlayerId;
      cardId: string;
      /** The row to put a Commander's Horn on. */
      row?: RowName;
      /** The unit on your own board that a Decoy swaps back to your hand. */
      targetId?: string;
    }
  | { type: "pass"; player: PlayerId };

export type Result = { ok: true; state: GameState } | { ok: false; error: string };

export const STARTING_LIVES = 2;
export const HAND_SIZE = 10;

export function other(player: PlayerId): PlayerId {
  return player === 0 ? 1 : 0;
}

/** Decides who plays first in round 1. */
export function coinToss(rng: Rng): PlayerId {
  return rng() < 0.5 ? 0 : 1;
}

export interface NewGameOptions {
  decks: [Card[], Card[]];
  firstPlayer: PlayerId;
  rng: Rng;
  handSize?: number;
}

function newPlayer(deck: Card[], handSize: number, rng: Rng): PlayerState {
  if (deck.length < handSize) {
    throw new RangeError(`A deck needs at least ${handSize} cards, got ${deck.length}`);
  }
  const shuffled = shuffle(deck, rng);
  return {
    hand: shuffled.slice(0, handSize),
    deck: shuffled.slice(handSize),
    graveyard: [],
    board: emptyBoard(),
    inPlay: [],
    lives: STARTING_LIVES,
    passed: false,
  };
}

export function newGame({ decks, firstPlayer, rng, handSize = HAND_SIZE }: NewGameOptions): GameState {
  return {
    players: [newPlayer(decks[0], handSize, rng), newPlayer(decks[1], handSize, rng)],
    round: 1,
    current: firstPlayer,
    roundStarter: firstPlayer,
    rounds: [],
    status: "playing",
    winner: null,
  };
}

function fail(error: string): Result {
  return { ok: false, error };
}

/** Returns an error message if the card cannot be played as specified, otherwise null. */
type Failure = string | null;

function playSpecial(
  state: GameState,
  playerId: PlayerId,
  card: SpecialCard,
  action: Extract<Action, { type: "play" }>,
): Failure {
  const me = state.players[playerId];

  switch (card.effect) {
    case "weather": {
      if (card.weather === "clearWeather") {
        for (const player of state.players) {
          for (const name of ROW_NAMES) player.board[name].weather = false;
          player.graveyard.push(...player.inPlay.filter((c) => c.effect === "weather"));
          player.inPlay = player.inPlay.filter((c) => c.effect !== "weather");
        }
        me.graveyard.push(card);
      } else {
        for (const player of state.players) {
          for (const name of WEATHER_ROWS[card.weather]) player.board[name].weather = true;
        }
        me.inPlay.push(card);
      }
      return null;
    }

    case "horn": {
      if (!action.row) return "Choose a row for the horn";
      if (me.board[action.row].hornCard) return "That row already has a horn";
      me.board[action.row].hornCard = true;
      me.inPlay.push(card);
      return null;
    }

    case "decoy": {
      if (!action.targetId) return "Choose a unit to swap with the decoy";
      for (const name of ROW_NAMES) {
        const units = me.board[name].units;
        const index = units.findIndex((u) => u.id === action.targetId);
        if (index === -1) continue;
        const target = units[index] as UnitCard;
        if (target.isHero) return "A hero cannot be swapped";
        units.splice(index, 1);
        me.hand.push(target);
        me.inPlay.push(card);
        return null;
      }
      return "That unit is not on your board";
    }

    case "scorch": {
      const candidates = state.players.flatMap((player, owner) =>
        ROW_NAMES.flatMap((name) =>
          player.board[name].units
            .filter((unit) => !unit.isHero)
            .map((unit) => ({ owner, name, unit, power: unitPower(player.board[name], unit) })),
        ),
      );
      const strongest = Math.max(...candidates.map((c) => c.power));
      const doomed = candidates.filter((c) => c.power === strongest);
      for (const { owner, name, unit } of doomed) {
        const player = state.players[owner as PlayerId];
        player.board[name].units = player.board[name].units.filter((u) => u !== unit);
        player.graveyard.push(unit);
      }
      me.graveyard.push(card);
      return null;
    }
  }
}

/**
 * Applies one action and returns the new state. The input state is never
 * modified, and an illegal action returns an error instead of throwing.
 */
export function applyAction(state: GameState, action: Action): Result {
  if (state.status === "finished") return fail("The game is over");
  if (action.player !== state.current) return fail("It is not your turn");

  const next = structuredClone(state);
  const me = next.players[action.player];
  const opponent = next.players[other(action.player)];

  if (action.type === "play") {
    const index = me.hand.findIndex((card) => card.id === action.cardId);
    const card = index === -1 ? undefined : me.hand[index];
    if (!card) return fail("That card is not in your hand");
    me.hand.splice(index, 1);

    if (card.kind === "unit") {
      me.board[card.row].units.push(card);
    } else {
      const error = playSpecial(next, action.player, card, action);
      if (error) return fail(error);
    }
  } else {
    me.passed = true;
  }

  if (me.passed && opponent.passed) {
    return { ok: true, state: endRound(next) };
  }

  // Play alternates, unless the opponent has passed: then this player keeps going.
  next.current = opponent.passed ? action.player : other(action.player);
  return { ok: true, state: next };
}

/** Every action the current player may take. Used by the AI and the UI. */
export function legalActions(state: GameState): Action[] {
  if (state.status === "finished") return [];
  const player = state.current;
  const me = state.players[player];
  const actions: Action[] = [];

  for (const card of me.hand) {
    if (card.kind === "unit") {
      actions.push({ type: "play", player, cardId: card.id });
    } else if (card.effect === "horn") {
      for (const row of ROW_NAMES) {
        if (!me.board[row].hornCard) actions.push({ type: "play", player, cardId: card.id, row });
      }
    } else if (card.effect === "decoy") {
      for (const row of ROW_NAMES) {
        for (const unit of me.board[row].units) {
          if (!unit.isHero) actions.push({ type: "play", player, cardId: card.id, targetId: unit.id });
        }
      }
    } else {
      actions.push({ type: "play", player, cardId: card.id });
    }
  }

  actions.push({ type: "pass", player });
  return actions;
}

/**
 * Who starts the next round.
 *
 * ASSUMPTION, check against the original game: the winner of the round starts
 * the next one, and after a draw the same player starts again.
 */
function nextRoundStarter(previous: PlayerId, winner: PlayerId | "draw"): PlayerId {
  return winner === "draw" ? previous : winner;
}

function endRound(state: GameState): GameState {
  const [a, b] = state.players;
  const scores: [number, number] = [boardPower(a.board), boardPower(b.board)];
  const winner: PlayerId | "draw" = scores[0] === scores[1] ? "draw" : scores[0] > scores[1] ? 0 : 1;

  // The loser loses a life; on a draw both do.
  if (winner !== 1) b.lives -= 1;
  if (winner !== 0) a.lives -= 1;

  for (const player of state.players) {
    for (const row of ROW_NAMES) {
      player.graveyard.push(...player.board[row].units);
    }
    player.graveyard.push(...player.inPlay);
    player.inPlay = [];
    player.board = emptyBoard();
    player.passed = false;
  }

  state.rounds.push({ round: state.round, scores, winner });

  if (a.lives <= 0 || b.lives <= 0) {
    state.status = "finished";
    state.winner = a.lives <= 0 && b.lives <= 0 ? "draw" : a.lives <= 0 ? 1 : 0;
    return state;
  }

  state.round += 1;
  state.roundStarter = nextRoundStarter(state.roundStarter, winner);
  state.current = state.roundStarter;
  return state;
}
