import { type ReactNode, useEffect, useRef } from "react";
import type { Action, GameState, PlayerId } from "../engine/game";
import { STARTING_LIVES, legalActions } from "../engine/game";
import { boardPower } from "../engine/scoring";
import type { Card, Faction, RowName } from "../engine/types";
import { FACTION_NAME } from "./art";
import { CardView } from "./CardView";
import { AI, HUMAN } from "./controller";

const SHIELD: Record<Faction, string> = {
  northernRealms: "realms",
  nilfgaard: "nilfgaard",
  scoiatael: "scoiatael",
  monsters: "monsters",
  skellige: "skellige",
};
const ui = (file: string): string => `/img/ui/${file}`;

function Lives({ count }: { count: number }) {
  return (
    <span className="lives" role="img" aria-label={`${count} of ${STARTING_LIVES} lives left`}>
      {Array.from({ length: STARTING_LIVES }, (_, i) => (
        <img key={i} className="gem" src={ui(i < count ? "icon_gem_on.png" : "icon_gem_off.png")} alt="" />
      ))}
    </span>
  );
}

/** A player's portrait, name, faction, cards in hand, lives and running total. */
function PlayerPanel({ game, side }: { game: GameState; side: PlayerId }) {
  const me = game.players[side];
  const total = boardPower(me.board);
  const other = boardPower(game.players[side === HUMAN ? AI : HUMAN].board);
  const name = side === HUMAN ? "You" : "Opponent";
  const faction = me.faction ? FACTION_NAME[me.faction] : "No faction";
  const mine = side === HUMAN;

  return (
    <div
      className={`stats ${mine ? "stats-me" : "stats-op"} ${game.current === side && game.status === "playing" ? "current-turn" : ""}`}
      data-testid={`score-${mine ? "you" : "opponent"}`}
    >
      <div className="profile" aria-hidden="true">
        {me.leader?.art ? (
          <img className="profile-img" src={me.leader.art} alt="" />
        ) : (
          <span className="profile-img initial">{name[0]}</span>
        )}
        <img className="profile-border" src={ui("icon_player_border.png")} alt="" />
        {me.faction && <img className="profile-shield" src={ui(`deck_shield_${SHIELD[me.faction]}.png`)} alt="" />}
      </div>
      <span className="player-name">{name}</span>
      <span className="player-faction">{faction}</span>
      <span className="hand-count" role="img" aria-label={`${me.hand.length} cards in hand`}>
        {me.hand.length}
      </span>
      <Lives count={me.lives} />
      {me.passed && <span className="passed-tag">Passed</span>}
      <strong
        className={`total ${total > other ? "leading" : ""}`}
        style={{ backgroundImage: `url(${ui(mine ? "score_total_me.png" : "score_total_op.png")})` }}
        aria-label={`${name} total`}
      >
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

function leaderNote(p: GameState["players"][number]): string {
  return !p.leader ? "No leader" : p.leaderUsed ? "Used" : "Ready";
}

/** Everything on the left of the board: leaders, player panels, the weather box and Pass. */
export function PlayersColumn({ game, canAct, onAct }: ColumnProps) {
  const me = game.players[HUMAN];
  const them = game.players[AI];
  const leaderReady = canAct && legalActions(game).some((a) => a.type === "leader");

  return (
    <aside className="players-col" aria-label="Match information">
      <div className="leader leader-op" title={them.leader?.name}>
        {them.leader?.art && <img className="leader-face" src={them.leader.art} alt="" />}
        {!them.leaderUsed && them.leader && <img className="leader-ready" src={ui("icon_leader_active.png")} alt="" />}
        <span className="visually-hidden">
          Opponent leader: {them.leader?.name ?? "none"} ({leaderNote(them)})
        </span>
      </div>
      <PlayerPanel game={game} side={AI} />
      <WeatherSlot game={game} />
      <PlayerPanel game={game} side={HUMAN} />
      <button
        type="button"
        className={`leader leader-me ${leaderReady ? "ready" : ""}`}
        disabled={!leaderReady}
        title={me.leader?.name}
        onClick={() => onAct({ type: "leader", player: HUMAN })}
      >
        {me.leader?.art && <img className="leader-face" src={me.leader.art} alt="" />}
        {leaderReady && <img className="leader-ready" src={ui("icon_leader_active.png")} alt="" />}
        <span className="visually-hidden">
          Leader: {me.leader?.name ?? "none"} ({leaderNote(me)})
        </span>
      </button>
      <button
        type="button"
        className="pass-button"
        disabled={!canAct}
        onClick={() => onAct({ type: "pass", player: HUMAN })}
      >
        Pass
      </button>
    </aside>
  );
}

function Pile({
  kind,
  count,
  label,
  className,
  faction,
  top,
  onClick,
}: {
  kind: "deck" | "grave";
  count: number;
  label: string;
  className: string;
  faction: Faction | null;
  top?: Card;
  onClick?: () => void;
}) {
  const back = faction ? ui(`deck_back_${SHIELD[faction]}.jpg`) : undefined;
  const inner = (
    <>
      {kind === "deck" && back && <img className="pile-face" src={back} alt="" />}
      {kind === "grave" && top?.art && <img className="pile-face top-card" src={top.art} alt="" />}
      <span className="pile-count" aria-hidden="true">
        {count}
      </span>
    </>
  );
  return onClick ? (
    <button type="button" className={`pile ${kind} ${className}`} aria-label={label} onClick={onClick}>
      {inner}
    </button>
  ) : (
    <div className={`pile ${kind} ${className}`} aria-label={label} role="group">
      {inner}
    </div>
  );
}

interface PilesProps extends ColumnProps {
  onViewGraveyard: (side: PlayerId) => void;
}

/** The right of the board: each player's graveyard and deck. */
export function PilesColumn({ game, onViewGraveyard }: PilesProps) {
  const me = game.players[HUMAN];
  const them = game.players[AI];
  return (
    <div className="piles-col">
      <Pile
        kind="grave"
        className="grave-op"
        count={them.graveyard.length}
        label={`Opponent graveyard (${them.graveyard.length})`}
        faction={them.faction}
        top={them.graveyard.at(-1)}
        onClick={() => onViewGraveyard(AI)}
      />
      <Pile
        kind="deck"
        className="deck-op"
        count={them.deck.length}
        label={`Opponent deck (${them.deck.length})`}
        faction={them.faction}
      />
      <Pile
        kind="grave"
        className="grave-me"
        count={me.graveyard.length}
        label={`Your graveyard (${me.graveyard.length})`}
        faction={me.faction}
        top={me.graveyard.at(-1)}
        onClick={() => onViewGraveyard(HUMAN)}
      />
      <Pile
        kind="deck"
        className="deck-me"
        count={me.deck.length}
        label={`Your deck (${me.deck.length})`}
        faction={me.faction}
      />
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

export function CardList({
  cards,
  onPick,
  empty,
}: {
  cards: readonly Card[];
  onPick?: (card: Card) => void;
  empty: string;
}) {
  if (cards.length === 0) return <p className="muted-small">{empty}</p>;
  return (
    <div className="card-list">
      {cards.map((card) => (
        <CardView
          key={card.id}
          card={card}
          size="hand"
          onClick={onPick ? () => onPick(card) : undefined}
          testId={`pick-${card.id}`}
        />
      ))}
    </div>
  );
}
