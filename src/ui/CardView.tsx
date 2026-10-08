import type { Card, SpecialCard, UnitCard } from "../engine/types";
import { ABILITY_BADGE, CardArt, RowIcon } from "./art";
import { usePreview } from "./preview";

export const ROW_LABEL = { close: "Close combat", ranged: "Ranged", siege: "Siege" } as const;

function specialKind(card: SpecialCard): string {
  return card.effect === "weather" ? "Weather" : card.effect[0]!.toUpperCase() + card.effect.slice(1);
}

export type CardSize = "board" | "hand" | "list";

interface CardViewProps {
  card: Card;
  /** A unit's current strength after weather, bonds and so on. Defaults to its printed strength. */
  power?: number;
  size?: CardSize;
  selected?: boolean;
  /** Dim the card when it cannot be played. */
  dimmed?: boolean;
  /** Highlight the card as something the player may click now. */
  target?: boolean;
  onClick?: () => void;
  testId?: string;
}

export function CardView({ card, power, size = "board", selected, dimmed, target, onClick, testId }: CardViewProps) {
  const preview = usePreview();
  const unit: UnitCard | null = card.kind === "unit" ? card : null;
  const shown = unit ? (power ?? unit.basePower) : null;
  const change =
    unit && shown !== null ? (shown > unit.basePower ? "boosted" : shown < unit.basePower ? "reduced" : "") : "";

  const classes = [
    "card",
    `size-${size}`,
    unit ? "unit" : "special",
    unit?.isHero ? "hero" : "",
    selected ? "selected" : "",
    dimmed ? "dimmed" : "",
    target ? "target" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const label = unit
    ? `${card.name}, strength ${shown}${unit.isHero ? ", hero" : ""}, ${ROW_LABEL[unit.row]}`
    : `${card.name}, ${specialKind(card as SpecialCard)} card`;

  const body = (
    <>
      <CardArt card={card} />
      {unit && shown !== null ? (
        <span className={`power ${change}`} aria-hidden="true">
          {shown}
        </span>
      ) : (
        <span className="special-tag" aria-hidden="true">
          {specialKind(card as SpecialCard)}
        </span>
      )}
      {unit && (
        <>
          <span className="badges" aria-hidden="true">
            {unit.abilities.map((a) => (
              <span
                key={a}
                className="badge"
                style={{ background: ABILITY_BADGE[a].color }}
                title={ABILITY_BADGE[a].label}
              >
                {ABILITY_BADGE[a].code}
              </span>
            ))}
          </span>
          <RowIcon row={unit.row} className="row-icon" />
        </>
      )}
      <span className="name">{card.name}</span>
    </>
  );

  const hover = {
    onMouseEnter: () => preview.show({ card, power }),
    onMouseLeave: preview.hide,
    onFocus: () => preview.show({ card, power }),
    onBlur: preview.hide,
  };

  if (!onClick) {
    return (
      <div className={classes} aria-label={label} data-testid={testId} role="group" {...hover}>
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={classes}
      aria-label={label}
      aria-pressed={selected ?? false}
      onClick={onClick}
      data-testid={testId}
      {...hover}
    >
      {body}
    </button>
  );
}
