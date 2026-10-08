import { shuffle, type Rng } from "./rng";
import { boardPower, unitPower } from "./scoring";
import {
  WEATHER_ROWS,
  emptyBoard,
  type Board,
  type Card,
  type PlayerId,
  type RowName,
  type SpecialCard,
  type UnitCard,
} from "./types";

export type { PlayerId };

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

/** A choice the current player must make before play continues. */
export interface PendingChoice {
  type: "revive";
  player: PlayerId;
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
  /** While set, only the matching choice may be made (a medic picking a unit to revive). */
  pending: PendingChoice | null;
}

export type Action =
  | {
      type: "play";
      player: PlayerId;
      cardId: string;
      /** The row for a Commander's Horn, or for an agile unit (close or ranged). */
      row?: RowName;
      /** The unit on your own board that a Decoy swaps back to your hand. */
      targetId?: string;
    }
  | { type: "pass"; player: PlayerId }
  /** Resolve a medic: choose a non-hero unit from your own graveyard. */
  | { type: "revive"; player: PlayerId; cardId: string };

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
    pending: null,
  };
}

function fail(error: string): Result {
  return { ok: false, error };
}

/** Which player a unit belongs to: who played it, or the side it sits on if unknown. */
function ownerOf(unit: UnitCard, side: PlayerId): PlayerId {
  return unit.owner ?? side;
}

function revivable(player: PlayerState): UnitCard[] {
  return player.graveyard.filter((c): c is UnitCard => c.kind === "unit" && !c.isHero);
}

/** Destroys the given units. Each goes to the graveyard of the side it was on. */
function destroy(state: GameState, doomed: { side: PlayerId; row: RowName; unit: UnitCard }[]): void {
  for (const { side, row, unit } of doomed) {
    const board = state.players[side].board[row];
    board.units = board.units.filter((u) => u !== unit);
    state.players[side].graveyard.push(unit);
  }
}

/**
 * Puts a unit onto the board and runs its on-play abilities. Used for cards
 * played from the hand and for units revived by a medic.
 *
 *  - spy: goes to the opponent's board, and its owner draws two cards
 *  - muster: every card with the same muster group comes out of the deck
 *    (placed without triggering its own abilities)
 *  - scorch: destroys the strongest enemy unit(s) in the same row, if the
 *    enemy's units there total 10 or more
 *  - medic: the owner must now choose a unit to revive, if there is one
 */
function deployUnit(state: GameState, playerId: PlayerId, card: UnitCard, row: RowName): void {
  const me = state.players[playerId];
  const opponentId = other(playerId);
  const sideId = card.abilities.includes("spy") ? opponentId : playerId;

  state.players[sideId].board[row].units.push({ ...card, owner: playerId });

  if (card.abilities.includes("spy")) {
    me.hand.push(...me.deck.splice(0, 2));
  }

  if (card.abilities.includes("muster") && card.musterGroup !== undefined) {
    const mates = me.deck.filter(
      (c): c is UnitCard => c.kind === "unit" && c.musterGroup === card.musterGroup,
    );
    me.deck = me.deck.filter((c) => !mates.includes(c as UnitCard));
    for (const mate of mates) {
      me.board[mate.row].units.push({ ...mate, owner: playerId });
    }
  }

  if (card.abilities.includes("scorch")) {
    const enemyRow = state.players[opponentId].board[row];
    const enemies = enemyRow.units.filter((u) => ownerOf(u, opponentId) === opponentId);
    const total = enemies.reduce((sum, u) => sum + unitPower(enemyRow, u), 0);
    if (total >= 10) {
      const targets = enemies
        .filter((u) => !u.isHero)
        .map((unit) => ({ unit, power: unitPower(enemyRow, unit) }));
      const strongest = Math.max(...targets.map((t) => t.power));
      destroy(
        state,
        targets.filter((t) => t.power === strongest).map((t) => ({ side: opponentId, row, unit: t.unit })),
      );
    }
  }

  if (card.abilities.includes("medic") && revivable(me).length > 0) {
    state.pending = { type: "revive", player: playerId };
  }
}

function playSpecial(
  state: GameState,
  playerId: PlayerId,
  card: SpecialCard,
  action: Extract<Action, { type: "play" }>,
): string | null {
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
        // A spy on your side belongs to your opponent: you cannot take it.
        if (ownerOf(target, playerId) !== playerId) return "That unit is not on your board";
        if (target.isHero) return "A hero cannot be swapped";
        units.splice(index, 1);
        me.hand.push(target);
        me.inPlay.push(card);
        return null;
      }
      return "That unit is not on your board";
    }

    case "scorch": {
      const candidates = state.players.flatMap((player, side) =>
        ROW_NAMES.flatMap((row) =>
          player.board[row].units
            .filter((unit) => !unit.isHero)
            .map((unit) => ({ side: side as PlayerId, row, unit, power: unitPower(player.board[row], unit) })),
        ),
      );
      const strongest = Math.max(...candidates.map((c) => c.power));
      destroy(state, candidates.filter((c) => c.power === strongest));
      me.graveyard.push(card);
      return null;
    }
  }
}

/** Ends the turn: finish the round if both have passed, otherwise hand over play. */
function finishTurn(state: GameState, playerId: PlayerId): GameState {
  const me = state.players[playerId];
  const opponent = state.players[other(playerId)];
  if (me.passed && opponent.passed) return endRound(state);
  // Play alternates, unless the opponent has passed: then this player keeps going.
  state.current = opponent.passed ? playerId : other(playerId);
  return state;
}

/**
 * Applies one action and returns the new state. The input state is never
 * modified, and an illegal action returns an error instead of throwing.
 */
export function applyAction(state: GameState, action: Action): Result {
  if (state.status === "finished") return fail("The game is over");
  if (action.player !== state.current) return fail("It is not your turn");
  if (state.pending && action.type !== "revive") return fail("Choose a unit to revive first");

  const next = structuredClone(state);
  const me = next.players[action.player];

  if (action.type === "revive") {
    if (!next.pending) return fail("There is nothing to revive");
    const target = revivable(me).find((c) => c.id === action.cardId);
    if (!target) return fail("Choose a non-hero unit from your graveyard");
    me.graveyard.splice(me.graveyard.indexOf(target), 1);
    next.pending = null;
    deployUnit(next, action.player, target, target.row);
    return { ok: true, state: next.pending ? next : finishTurn(next, action.player) };
  }

  if (action.type === "play") {
    const index = me.hand.findIndex((card) => card.id === action.cardId);
    const card = index === -1 ? undefined : me.hand[index];
    if (!card) return fail("That card is not in your hand");

    if (card.kind === "unit") {
      const row = action.row ?? card.row;
      const allowed: RowName[] = card.abilities.includes("agile") ? ["close", "ranged"] : [card.row];
      if (!allowed.includes(row)) return fail(`That card cannot be played to the ${row} row`);
      me.hand.splice(index, 1);
      deployUnit(next, action.player, card, row);
    } else {
      me.hand.splice(index, 1);
      const error = playSpecial(next, action.player, card, action);
      if (error) return fail(error);
    }
  } else {
    me.passed = true;
  }

  return { ok: true, state: next.pending ? next : finishTurn(next, action.player) };
}

/** Every action the current player may take. Used by the AI and the UI. */
export function legalActions(state: GameState): Action[] {
  if (state.status === "finished") return [];
  const player = state.current;
  const me = state.players[player];

  if (state.pending) {
    return revivable(me).map((card): Action => ({ type: "revive", player, cardId: card.id }));
  }

  const actions: Action[] = [];
  for (const card of me.hand) {
    if (card.kind === "unit") {
      if (card.abilities.includes("agile")) {
        actions.push({ type: "play", player, cardId: card.id, row: "close" });
        actions.push({ type: "play", player, cardId: card.id, row: "ranged" });
      } else {
        actions.push({ type: "play", player, cardId: card.id });
      }
    } else if (card.effect === "horn") {
      for (const row of ROW_NAMES) {
        if (!me.board[row].hornCard) actions.push({ type: "play", player, cardId: card.id, row });
      }
    } else if (card.effect === "decoy") {
      for (const row of ROW_NAMES) {
        for (const unit of me.board[row].units) {
          if (!unit.isHero && ownerOf(unit, player) === player) {
            actions.push({ type: "play", player, cardId: card.id, targetId: unit.id });
          }
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

  // Units go to the graveyard of the side they were on, so a spy lands in the
  // opponent's graveyard and their medic can bring it back.
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
