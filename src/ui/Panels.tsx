import { type ReactNode, useEffect, useRef } from "react";
import type { Action, GameState, PlayerId } from "../engine/game";
import { STARTING_LIVES, legalActions } from "../engine/game";
import { boardPower } from "../engine/scoring";
import type { Card } from "../engine/types";
import { CardView } from "./CardView";
import { AI, HUMAN } from "./controller";

function Lives({ count }: { count: number }) {
  return (
    <span className="lives" role="img" aria-label={`${count} of ${STARTING_LIVES} lives left`}>
      {Array.from({ length: STARTING_LIVES }, (_, i) => (
        <span key={i} className={i < count ? "gem full" : "gem"} aria-hidden="true" />
      ))}
    </span>
  );
}

interface SidebarProps {
  game: GameState;
  log: string[];
  canAct: boolean;
  onAct: (action: Action) => void;
  onViewGraveyard: (side: PlayerId) => void;
}

export function Sidebar({ game, log, canAct, onAct, onViewGraveyard }: SidebarProps) {
  const me = game.players[HUMAN];
  const them = game.players[AI];
  const logEnd = useRef<HTMLLIElement>(null);
  useEffect(() => {
    logEnd.current?.scrollIntoView?.({ block: "nearest" });
  }, [log.length]);

  const leaderReady = canAct && legalActions(game).some((a) => a.type === "leader");
  const leaderNote = (leader: GameState["players"][number]) =>
    !leader.leader ? "No leader" : leader.leaderUsed ? "Used" : "Ready";

  return (
    <aside className="sidebar" aria-label="Match information">
      <div className="panel round">
        <h2>Round {game.round} of 3</h2>
        <div className="score-line" data-testid="score-opponent">
          <span>Opponent</span>
          <Lives count={them.lives} />
          <strong>{boardPower(them.board)}</strong>
        </div>
        <div className="score-line you" data-testid="score-you">
          <span>You</span>
          <Lives count={me.lives} />
          <strong>{boardPower(me.board)}</strong>
        </div>
        <p className="counts">
          Opponent: {them.hand.length} in hand, {them.deck.length} in deck. You: {me.deck.length} in deck.
        </p>
      </div>

      <div className="panel actions">
        <button
          type="button"
          className="btn leader"
          disabled={!leaderReady}
          onClick={() => onAct({ type: "leader", player: HUMAN })}
        >
          Leader: {me.leader?.name ?? "none"} ({leaderNote(me)})
        </button>
        <p className="muted">Opponent leader: {them.leader?.name ?? "none"} ({leaderNote(them)})</p>
        <button
          type="button"
          className="btn pass"
          disabled={!canAct}
          onClick={() => onAct({ type: "pass", player: HUMAN })}
        >
          Pass
        </button>
      </div>

      <div className="panel graves">
        <button type="button" className="btn small" onClick={() => onViewGraveyard(HUMAN)}>
          Your graveyard ({me.graveyard.length})
        </button>
        <button type="button" className="btn small" onClick={() => onViewGraveyard(AI)}>
          Opponent graveyard ({them.graveyard.length})
        </button>
      </div>

      <div className="panel log">
        <h3>Log</h3>
        <ol aria-live="polite">
          {log.length === 0 && <li className="muted">Nothing yet.</li>}
          {log.map((line, i) => (
            <li key={i} ref={i === log.length - 1 ? logEnd : undefined}>
              {line}
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
}

interface ModalProps {
  title: string;
  children: ReactNode;
  onClose?: () => void;
}

export function Modal({ title, children, onClose }: ModalProps) {
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
        {onClose && (
          <button type="button" className="btn small close" onClick={onClose}>
            Close
          </button>
        )}
      </div>
    </div>
  );
}

export function CardList({ cards, onPick, empty }: { cards: readonly Card[]; onPick?: (card: Card) => void; empty: string }) {
  if (cards.length === 0) return <p className="muted">{empty}</p>;
  return (
    <div className="card-list">
      {cards.map((card) => (
        <CardView key={card.id} card={card} onClick={onPick ? () => onPick(card) : undefined} testId={`pick-${card.id}`} />
      ))}
    </div>
  );
}
