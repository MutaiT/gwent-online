import { useEffect, useReducer, useState } from "react";
import { legalActions, type Action, type PlayerId } from "../engine/game";
import { boardPower } from "../engine/scoring";
import { Board } from "./Board";
import { CardView } from "./CardView";
import { AI, HUMAN, choicesFor, initialState, playableIds, reducer, type UIState } from "./controller";
import { CardList, LogPanel, Modal, PilesColumn, PlayersColumn } from "./Panels";

export interface AppProps {
  /** Seed for the shuffle. Leave out for a different game each time. */
  seed?: number;
  /** How long the opponent "thinks" before moving. */
  aiDelayMs?: number;
  /** Start from a ready-made state (used by tests). */
  initial?: UIState;
}

function freshSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

function statusText(state: UIState): string {
  const { game } = state;
  if (game.status === "finished") return "Game over";
  if (game.pending?.type === "revive") {
    return game.pending.player === HUMAN ? "Choose a unit to bring back" : "Opponent is choosing a unit to revive";
  }
  if (game.pending?.type === "chooseFirst") return "Choose who goes first";
  if (game.current === AI) return "Opponent is thinking…";
  return game.players[AI].passed
    ? "Your turn. The opponent has passed: play on, or pass to end the round."
    : "Your turn";
}

export function App({ seed, aiDelayMs = 700, initial }: AppProps) {
  const [state, dispatch] = useReducer(reducer, undefined, () => initial ?? initialState(seed ?? freshSeed()));
  const [viewing, setViewing] = useState<PlayerId | null>(null);
  const { game } = state;

  // The opponent moves a moment after its turn starts.
  useEffect(() => {
    if (game.status !== "playing" || game.current !== AI) return;
    const timer = setTimeout(() => dispatch({ type: "ai" }), aiDelayMs);
    return () => clearTimeout(timer);
  }, [game, aiDelayMs]);

  const me = game.players[HUMAN];
  const act = (action: Action) => dispatch({ type: "act", action });
  const canAct = game.status === "playing" && game.current === HUMAN && !game.pending;
  const choices = choicesFor(game, state.selected);
  const playable = playableIds(game);
  const selectedCard = me.hand.find((c) => c.id === state.selected) ?? null;

  const onHandClick = (cardId: string) => {
    if (state.selected === cardId) {
      // A second click plays a card that needs no further choice, otherwise it deselects.
      if (choices.plain) act(choices.plain);
      else dispatch({ type: "select", cardId: null });
    } else {
      dispatch({ type: "select", cardId });
    }
  };

  const revivePending = game.pending?.type === "revive" && game.pending.player === HUMAN;
  const choosePending = game.pending?.type === "chooseFirst" && game.pending.player === HUMAN;

  let prompt: string | null = null;
  if (selectedCard && canAct) {
    if (choices.plain) prompt = null;
    else if (choices.rows.size > 0) prompt = "Choose a row on your side.";
    else if (choices.targets.size > 0) prompt = "Choose one of your units to take back.";
    else prompt = "That card cannot be played right now.";
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>Gwent Online</h1>
        <h2 className="round-title">Round {game.round} of 3</h2>
        <p className="status" role="status" data-testid="status">
          {statusText(state)}
        </p>
        <button type="button" className="btn small" onClick={() => dispatch({ type: "restart", seed: freshSeed() })}>
          New game
        </button>
      </header>

      {state.error && (
        <div className="error" role="alert">
          {state.error}
          <button type="button" className="btn small" onClick={() => dispatch({ type: "dismissError" })}>
            Dismiss
          </button>
        </div>
      )}

      <main className="table" aria-label="Game board">
        <div className="table-grid">
          <PlayersColumn game={game} canAct={canAct} onAct={act} />
          <Board game={game} choices={choices} onAct={act} />
          <PilesColumn game={game} canAct={canAct} onAct={act} onViewGraveyard={setViewing} />
        </div>

        <div className="hand-bar">
          <div className="mobile-actions">
            <button type="button" className="btn small" disabled={!canAct} onClick={() => act({ type: "pass", player: HUMAN })}>
              Pass
            </button>
            <button
              type="button"
              className="btn small"
              disabled={!canAct || !legalActions(game).some((a) => a.type === "leader")}
              onClick={() => act({ type: "leader", player: HUMAN })}
            >
              Leader
            </button>
            <span className="muted-small">
              You {boardPower(me.board)} to {boardPower(game.players[AI].board)} opponent
            </span>
          </div>
          {selectedCard && canAct && (
            <div className="prompt" data-testid="prompt">
              {choices.plain ? (
                <button type="button" className="btn primary" onClick={() => act(choices.plain as Action)}>
                  Play {selectedCard.name}
                </button>
              ) : (
                <span>{prompt}</span>
              )}
              <button type="button" className="btn small" onClick={() => dispatch({ type: "select", cardId: null })}>
                Cancel
              </button>
            </div>
          )}
          <div className="hand" aria-label="Your hand">
            {me.hand.length === 0 && <span className="muted-small">No cards in hand. Pass to end the round.</span>}
            {me.hand.map((card) => (
              <CardView
                key={card.id}
                card={card}
                size="hand"
                selected={state.selected === card.id}
                dimmed={!playable.has(card.id)}
                onClick={canAct && playable.has(card.id) ? () => onHandClick(card.id) : undefined}
                testId={`hand-${card.id}`}
              />
            ))}
          </div>
        </div>

        <LogPanel log={state.log} />
      </main>

      {revivePending && (
        <Modal title="Bring a unit back">
          <CardList
            cards={legalActions(game).flatMap((a) =>
              a.type === "revive" ? me.graveyard.filter((c) => c.id === a.cardId) : [],
            )}
            onPick={(card) => act({ type: "revive", player: HUMAN, cardId: card.id })}
            empty="Nothing to revive."
          />
        </Modal>
      )}

      {choosePending && (
        <Modal title="Who goes first?">
          <div className="choice-row">
            <button type="button" className="btn primary" onClick={() => act({ type: "chooseFirst", player: HUMAN, first: HUMAN })}>
              I go first
            </button>
            <button type="button" className="btn" onClick={() => act({ type: "chooseFirst", player: HUMAN, first: AI })}>
              Opponent goes first
            </button>
          </div>
        </Modal>
      )}

      {viewing !== null && (
        <Modal title={viewing === HUMAN ? "Your graveyard" : "Opponent's graveyard"} onClose={() => setViewing(null)}>
          <CardList cards={game.players[viewing].graveyard} empty="Empty." />
        </Modal>
      )}

      {game.status === "finished" && (
        <Modal title={game.winner === "draw" ? "A draw" : game.winner === HUMAN ? "You won!" : "You lost"}>
          <ul className="results">
            {game.rounds.map((r) => (
              <li key={r.round}>
                Round {r.round}: you {r.scores[0]}, opponent {r.scores[1]}
              </li>
            ))}
          </ul>
          <button type="button" className="btn primary" onClick={() => dispatch({ type: "restart", seed: freshSeed() })}>
            Play again
          </button>
        </Modal>
      )}
    </div>
  );
}
