import { shuffle, type Rng } from "./rng";
import { boardPower } from "./scoring";
import { emptyBoard, type Board, type RowName, type UnitCard } from "./types";

export type PlayerId = 0 | 1;

export interface PlayerState {
  deck: UnitCard[];
  hand: UnitCard[];
  graveyard: UnitCard[];
  board: Board;
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
  | { type: "play"; player: PlayerId; cardId: string }
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
  decks: [UnitCard[], UnitCard[]];
  firstPlayer: PlayerId;
  rng: Rng;
  handSize?: number;
}

function newPlayer(deck: UnitCard[], handSize: number, rng: Rng): PlayerState {
  if (deck.length < handSize) {
    throw new RangeError(`A deck needs at least ${handSize} cards, got ${deck.length}`);
  }
  const shuffled = shuffle(deck, rng);
  return {
    hand: shuffled.slice(0, handSize),
    deck: shuffled.slice(handSize),
    graveyard: [],
    board: emptyBoard(),
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
    const card = index === -1 ? undefined : me.hand.splice(index, 1)[0];
    if (!card) return fail("That card is not in your hand");
    me.board[card.row].units.push(card);
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
  const plays = state.players[player].hand.map(
    (card): Action => ({ type: "play", player, cardId: card.id }),
  );
  return [...plays, { type: "pass", player }];
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
    for (const row of Object.keys(player.board) as RowName[]) {
      player.graveyard.push(...player.board[row].units);
    }
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
