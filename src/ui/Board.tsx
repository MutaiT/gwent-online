import type { Action, GameState, PlayerId } from "../engine/game";
import { rowPower, unitPower } from "../engine/scoring";
import type { RowName } from "../engine/types";
import { CardView, ROW_LABEL } from "./CardView";
import type { Choices } from "./controller";

const OPPONENT_ORDER: RowName[] = ["siege", "ranged", "close"];
const PLAYER_ORDER: RowName[] = ["close", "ranged", "siege"];

interface RowProps {
  game: GameState;
  side: PlayerId;
  row: RowName;
  /** Set when the player may click this row to play the selected card there. */
  rowAction: Action | null;
  /** Units on this row the player may click (decoy). */
  targets: Map<string, Action>;
  onAct: (action: Action) => void;
}

function RowView({ game, side, row, rowAction, targets, onAct }: RowProps) {
  const state = game.players[side].board[row];
  const label = ROW_LABEL[row];
  const clickable = rowAction !== null;

  const header = (
    <>
      <span className="row-label">{label}</span>
      <span className="row-flags">
        {state.weather && <span className="flag weather" title="Weather: non-hero units here count as 1">Weather</span>}
        {state.hornCard && <span className="flag horn" title="Horn: units here are doubled">Horn</span>}
      </span>
      <span className="row-score" aria-label={`${label} total`}>
        {rowPower(state)}
      </span>
    </>
  );

  return (
    <div
      className={`row ${clickable ? "row-target" : ""}`}
      data-testid={`row-${side}-${row}`}
      aria-label={`${side === 0 ? "Your" : "Opponent's"} ${label} row`}
    >
      {clickable ? (
        <button type="button" className="row-head row-pick" onClick={() => onAct(rowAction)}>
          {header}
          <span className="row-pick-hint">Play here</span>
        </button>
      ) : (
        <div className="row-head">{header}</div>
      )}
      <div className="row-cards">
        {state.units.length === 0 && <span className="row-empty">empty</span>}
        {state.units.map((unit) => {
          const action = targets.get(unit.id);
          return (
            <CardView
              key={unit.id}
              card={unit}
              power={unitPower(state, unit)}
              target={action !== undefined}
              onClick={action ? () => onAct(action) : undefined}
              testId={`board-${unit.id}`}
            />
          );
        })}
      </div>
    </div>
  );
}

interface BoardProps {
  game: GameState;
  choices: Choices;
  onAct: (action: Action) => void;
}

export function Board({ game, choices, onAct }: BoardProps) {
  const none = new Map<string, Action>();
  return (
    <div className="board">
      <div className="side opponent">
        {OPPONENT_ORDER.map((row) => (
          <RowView key={row} game={game} side={1} row={row} rowAction={null} targets={none} onAct={onAct} />
        ))}
      </div>
      <div className="divider" aria-hidden="true" />
      <div className="side player">
        {PLAYER_ORDER.map((row) => (
          <RowView
            key={row}
            game={game}
            side={0}
            row={row}
            rowAction={choices.rows.get(row) ?? null}
            targets={choices.targets}
            onAct={onAct}
          />
        ))}
      </div>
    </div>
  );
}
