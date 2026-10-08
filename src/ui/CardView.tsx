import type { Ability, Card, SpecialCard, UnitCard, WeatherType } from "../engine/types";

const ABILITY: Record<Ability, { label: string; help: string }> = {
  tightBond: { label: "Bond", help: "Tight bond: units with the same bond group in a row multiply each other's strength." },
  moraleBoost: { label: "Morale", help: "Morale boost: +1 to every other unit in the row." },
  horn: { label: "Horn", help: "Horn: doubles the other units in this row." },
  spy: { label: "Spy", help: "Spy: played on the opponent's side; you draw two cards." },
  medic: { label: "Medic", help: "Medic: bring back a non-hero unit from your graveyard." },
  muster: { label: "Muster", help: "Muster: brings every card of the same group out of your deck." },
  scorch: { label: "Scorch", help: "Scorch: destroys the strongest enemy units in the row if they total 10 or more." },
  agile: { label: "Agile", help: "Agile: can be played to close combat or ranged." },
};

const WEATHER: Record<WeatherType, string> = {
  bitingFrost: "Frost: close combat units drop to 1.",
  impenetrableFog: "Fog: ranged units drop to 1.",
  torrentialRain: "Rain: siege units drop to 1.",
  skelligeStorm: "Storm: ranged and siege units drop to 1.",
  clearWeather: "Clear weather: removes all weather.",
};

export const ROW_LABEL = { close: "Close combat", ranged: "Ranged", siege: "Siege" } as const;
const ROW_SHORT = { close: "Close", ranged: "Ranged", siege: "Siege" } as const;

function specialHelp(card: SpecialCard): string {
  switch (card.effect) {
    case "weather":
      return WEATHER[card.weather];
    case "horn":
      return "Commander's horn: doubles one of your rows.";
    case "decoy":
      return "Decoy: take one of your units back to your hand.";
    case "scorch":
      return "Scorch: destroys the strongest non-hero unit(s) on the whole board.";
  }
}

function specialKind(card: SpecialCard): string {
  return card.effect === "weather" ? "Weather" : card.effect[0]!.toUpperCase() + card.effect.slice(1);
}

interface CardViewProps {
  card: Card;
  /** A unit's current strength after weather, bonds and so on. Defaults to its printed strength. */
  power?: number;
  selected?: boolean;
  /** Dim the card when it cannot be played. */
  dimmed?: boolean;
  /** Highlight the card as something the player may click now. */
  target?: boolean;
  onClick?: () => void;
  testId?: string;
}

export function CardView({ card, power, selected, dimmed, target, onClick, testId }: CardViewProps) {
  const unit: UnitCard | null = card.kind === "unit" ? card : null;
  const shown = unit ? (power ?? unit.basePower) : null;
  const change = unit && shown !== null ? (shown > unit.basePower ? "boosted" : shown < unit.basePower ? "reduced" : "") : "";

  const classes = [
    "card",
    unit ? "unit" : "special",
    unit?.isHero ? "hero" : "",
    unit ? `row-${unit.row}` : "",
    selected ? "selected" : "",
    dimmed ? "dimmed" : "",
    target ? "target" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const help = unit ? unit.abilities.map((a) => ABILITY[a].help).join(" ") : specialHelp(card as SpecialCard);
  const label = unit
    ? `${card.name}, strength ${shown}${unit.isHero ? ", hero" : ""}, ${ROW_LABEL[unit.row]}`
    : `${card.name}, ${specialKind(card as SpecialCard)} card`;

  const body = (
    <>
      {unit && shown !== null ? (
        <span className={`power ${change}`} aria-hidden="true">
          {shown}
        </span>
      ) : (
        <span className="special-tag" aria-hidden="true">
          {specialKind(card as SpecialCard)}
        </span>
      )}
      <span className="name">{card.name}</span>
      {unit && (
        <span className="meta" aria-hidden="true">
          <span className="row-tag">{ROW_SHORT[unit.row]}</span>
          {unit.abilities.map((a) => (
            <span key={a} className="chip">
              {ABILITY[a].label}
            </span>
          ))}
        </span>
      )}
    </>
  );

  if (!onClick) {
    return (
      <div className={classes} title={help} aria-label={label} data-testid={testId} role="group">
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={classes}
      title={help}
      aria-label={label}
      aria-pressed={selected ?? false}
      onClick={onClick}
      data-testid={testId}
    >
      {body}
    </button>
  );
}
