import { type ReactNode, useEffect, useRef } from "react";
import type { Action, GameState, PlayerId } from "../engine/game";
import { STARTING_LIVES, legalActions } from "../engine/game";
import { boardPower } from "../engine/scoring";
import type { Card, RowName } from "../engine/types";
import { FACTION_NAME } from "./art";
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

function PlayerPanel({ game, side }: { game: GameState; side: PlayerId }) {
  const me = game.players[side];
  const total = boardPower(me.board);
  const other = boardPower(game.players[side === HUMAN ? AI : HUMAN].board);
  const name = side === HUMAN ? "You" : "Opponent";
  const faction = me.faction ? FACTION_NAME[me.faction] : "No faction";

  return (
    <div className={`player-panel ${side === HUMAN ? "mine" : "theirs"}`} data-testid={`score-${side === HUMAN ? "you" : "opponent"}`}>
      <div className="portrait" aria-hidden="true">
        {me.leader?.art ? <img src={me.leader.art} alt="" /> : name[0]}
      </div>
      <div className="player-info">
        <span className="player-name">{name}</span>
        <span className="player-faction">{faction}</span>
        <span className="player-stats">
          <span className="hand-count" role="img" aria-label={`${me.hand.length} cards in hand`}>
            <span className="mini-card" aria-hidden="true" />
            {me.hand.length}
          </span>
          <Lives count={me.lives} />
        </span>
        {me.passed && <span className="passed-tag">Passed</span>}
      </div>
      <strong className={`total ${total > other ? "leading" : ""}`} aria-label={`${name} total`}>
        {total}
      </strong>
    </div>
  );
}

const WEATHER_NAME: Record<RowName, string> = { close: "Frost", ranged: "Fog", siege: "Rain" };

function WeatherSlot({ game }: { game: GameState }) {
  const active = (["close", "ranged", "siege"] as const).filter((row) =>
    game.players.some((player) => player.board[row].weather),
  );
  return (
    <div className="weather-slot" aria-label="Weather">
      <span className="slot-title">Weather</span>
      <span className="weather-chips">
        {active.length === 0 && <span className="muted-small">clear</span>}
        {active.map((row) => (
          <span key={row} className="flag weather">
            {WEATHER_NAME[row]}
          </span>
        ))}
      </span>
    </div>
  );
}

interface ColumnProps {
  game: GameState;
  canAct: boolean;
  onAct: (action: Action) => void;
}

/** The left column: both players' panels, the weather slot, and Pass. */
export function PlayersColumn({ game, canAct, onAct }: ColumnProps) {
  return (
    <aside className="players-col" aria-label="Match information">
      <PlayerPanel game={game} side={AI} />
      <WeatherSlot game={game} />
      <div className="mine-block">
        <PlayerPanel game={game} side={HUMAN} />
        <button type="button" className="btn pass" disabled={!canAct} onClick={() => onAct({ type: "pass", player: HUMAN })}>
          Pass
        </button>
      </div>
    </aside>
  );
}

function Pile({ kind, count, label, onClick }: { kind: "deck" | "grave"; count: number; label: string; onClick?: () => void }) {
  const inner = (
    <>
      <span className={`pile-art ${kind}`} aria-hidden="true">
        {count}
      </span>
      <span className="pile-label">{kind === "deck" ? "Deck" : "Graveyard"}</span>
    </>
  );
  return onClick ? (
    <button type="button" className="pile" aria-label={label} onClick={onClick}>
      {inner}
    </button>
  ) : (
    <div className="pile" aria-label={label} role="group">
      {inner}
    </div>
  );
}

interface PilesProps extends ColumnProps {
  onViewGraveyard: (side: PlayerId) => void;
}

/** The right column: each player's leader, deck and graveyard. */
export function PilesColumn({ game, canAct, onAct, onViewGraveyard }: PilesProps) {
  const me = game.players[HUMAN];
  const them = game.players[AI];
  const note = (p: GameState["players"][number]) => (!p.leader ? "No leader" : p.leaderUsed ? "Used" : "Ready");
  const leaderReady = canAct && legalActions(game).some((a) => a.type === "leader");

  return (
    <div className="piles-col">
      <div className="pile-group">
        <div className="leader-slot theirs" title={them.leader?.name}>
          {them.leader?.art && <img className="leader-art" src={them.leader.art} alt="" />}
          <span className="slot-title">Opponent leader</span>
          <span className="leader-name">{them.leader?.name ?? "none"}</span>
          <span className="leader-state">{note(them)}</span>
        </div>
        <Pile kind="deck" count={them.deck.length} label={`Opponent deck (${them.deck.length})`} />
        <Pile
          kind="grave"
          count={them.graveyard.length}
          label={`Opponent graveyard (${them.graveyard.length})`}
          onClick={() => onViewGraveyard(AI)}
        />
      </div>
      <div className="pile-group">
        <button
          type="button"
          className="leader-slot mine"
          disabled={!leaderReady}
          onClick={() => onAct({ type: "leader", player: HUMAN })}
        >
          {me.leader?.art && <img className="leader-art" src={me.leader.art} alt="" />}
          <span className="slot-title">Your leader</span>
          <span className="leader-name">
            Leader: {me.leader?.name ?? "none"} ({note(me)})
          </span>
        </button>
        <Pile kind="deck" count={me.deck.length} label={`Your deck (${me.deck.length})`} />
        <Pile
          kind="grave"
          count={me.graveyard.length}
          label={`Your graveyard (${me.graveyard.length})`}
          onClick={() => onViewGraveyard(HUMAN)}
        />
      </div>
    </div>
  );
}

export function LogPanel({ log }: { log: string[] }) {
  const logEnd = useRef<HTMLLIElement>(null);
  useEffect(() => {
    logEnd.current?.scrollIntoView?.({ block: "nearest" });
  }, [log.length]);
  return (
    <details className="log" open>
      <summary>Log</summary>
      <ol aria-live="polite">
        {log.length === 0 && <li className="muted-small">Nothing yet.</li>}
        {log.map((line, i) => (
          <li key={i} ref={i === log.length - 1 ? logEnd : undefined}>
            {line}
          </li>
        ))}
      </ol>
    </details>
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
  if (cards.length === 0) return <p className="muted-small">{empty}</p>;
  return (
    <div className="card-list">
      {cards.map((card) => (
        <CardView key={card.id} card={card} size="hand" onClick={onPick ? () => onPick(card) : undefined} testId={`pick-${card.id}`} />
      ))}
    </div>
  );
}
