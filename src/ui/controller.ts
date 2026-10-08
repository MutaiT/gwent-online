import { chooseAction } from "../ai/ai";
import { DEFAULT_SETUP, buildMatch, type MatchSetup } from "../data/decks";
import { REDRAWS, applyAction, legalActions, newGame, type Action, type GameState, type PlayerId } from "../engine/game";
import { seededRng } from "../engine/rng";
import type { Card, RowName } from "../engine/types";

/** The person at the keyboard is always player 0. */
export const HUMAN: PlayerId = 0;
export const AI: PlayerId = 1;

export interface UIState {
  game: GameState;
  /** Newest last. */
  log: string[];
  /** The hand card the player has clicked, waiting for a row or target. */
  selected: string | null;
  error: string | null;
  aiSeed: number;
  /** The factions and leaders this game was started with, so Play again can reuse them. */
  setup: MatchSetup;
}

export type UIAction =
  | { type: "select"; cardId: string | null }
  | { type: "act"; action: Action }
  | { type: "ai" }
  | { type: "restart"; seed: number; setup?: MatchSetup }
  | { type: "dismissError" };

export function initialState(seed: number, setup: MatchSetup = DEFAULT_SETUP): UIState {
  const { decks, options } = buildMatch(setup);
  return {
    game: newGame({ decks, rng: seededRng(seed), redraws: REDRAWS, ...options }),
    log: [],
    selected: null,
    error: null,
    aiSeed: (seed * 7 + 13) >>> 0,
    setup,
  };
}

const who = (player: PlayerId): string => (player === HUMAN ? "You" : "Opponent");

function nameIn(cards: readonly Card[], id: string | undefined): string {
  return cards.find((c) => c.id === id)?.name ?? "a card";
}

/** A short past-tense sentence for the log. Call it with the state *before* the action. */
export function describeAction(state: GameState, action: Action): string {
  const me = state.players[action.player];
  const name = who(action.player);
  switch (action.type) {
    case "pass":
      return `${name} passed`;
    case "leader":
      return `${name} used ${me.leader?.name ?? "their leader"}`;
    case "revive":
      return `${name} revived ${nameIn(me.graveyard, action.cardId)}`;
    case "chooseFirst":
      return `${name} chose ${who(action.first)} to go first`;
    case "redraw":
      return `${name} redrew a card`;
    case "keepHand":
      return `${name} kept ${action.player === HUMAN ? "your" : "their"} hand`;
    case "play": {
      const card = nameIn(me.hand, action.cardId);
      if (action.row) return `${name} played ${card} on the ${action.row} row`;
      if (action.targetId) {
        const board = Object.values(me.board).flatMap((row) => row.units);
        return `${name} played ${card}, taking back ${nameIn(board, action.targetId)}`;
      }
      return `${name} played ${card}`;
    }
  }
}

function roundNotes(before: GameState, after: GameState): string[] {
  const notes: string[] = [];
  for (const result of after.rounds.slice(before.rounds.length)) {
    const outcome = result.winner === "draw" ? "a draw" : `${who(result.winner).toLowerCase()} won`;
    const you = result.scores[HUMAN];
    const them = result.scores[AI];
    notes.push(`Round ${result.round}: ${you} to ${them}, ${outcome}`);
  }
  if (before.status !== "finished" && after.status === "finished") {
    notes.push(
      after.winner === "draw" ? "The game ended in a draw" : after.winner === HUMAN ? "You won the game" : "The opponent won the game",
    );
  }
  return notes;
}

type Applied = { ok: true; state: UIState } | { ok: false; error: string };

function apply(state: UIState, action: Action): Applied {
  const result = applyAction(state.game, action);
  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    state: {
      ...state,
      game: result.state,
      log: [...state.log, describeAction(state.game, action), ...roundNotes(state.game, result.state)],
      selected: null,
      error: null,
    },
  };
}

export function reducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case "select":
      return { ...state, selected: action.cardId, error: null };
    case "dismissError":
      return { ...state, error: null };
    case "restart":
      return initialState(action.seed, action.setup ?? state.setup);
    case "act": {
      if (state.game.current !== HUMAN) return state;
      const next = apply(state, action.action);
      return next.ok ? next.state : { ...state, error: next.error };
    }
    case "ai": {
      if (state.game.status !== "playing" || state.game.current !== AI) return state;
      const choice = chooseAction(state.game, state.aiSeed);
      const next = apply({ ...state, aiSeed: choice.seed }, choice.action);
      return next.ok ? next.state : { ...state, aiSeed: choice.seed, error: next.error };
    }
  }
}

/** The ways the selected hand card can be played, grouped by what the player must click. */
export interface Choices {
  /** The card needs no further choice: one button plays it. */
  plain: Action | null;
  /** The card needs a row (horn, or an agile unit). */
  rows: Map<RowName, Action>;
  /** The card needs a unit on your own board (decoy). */
  targets: Map<string, Action>;
}

export function choicesFor(game: GameState, cardId: string | null): Choices {
  const choices: Choices = { plain: null, rows: new Map(), targets: new Map() };
  if (cardId === null || game.current !== HUMAN || game.pending) return choices;
  for (const action of legalActions(game)) {
    if (action.type !== "play" || action.cardId !== cardId) continue;
    if (action.targetId !== undefined) choices.targets.set(action.targetId, action);
    else if (action.row !== undefined) choices.rows.set(action.row, action);
    else choices.plain = action;
  }
  return choices;
}

/** The ids of hand cards that have at least one legal play right now. */
export function playableIds(game: GameState): Set<string> {
  if (game.current !== HUMAN || game.pending || game.status !== "playing") return new Set();
  return new Set(
    legalActions(game).flatMap((a) => (a.type === "play" ? [a.cardId] : [])),
  );
}
