import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Card } from "../engine/types";
import { ABILITY_BADGE, CardArt, RowIcon } from "./art";
import { ROW_LABEL } from "./CardView";

/** What the preview shows: a card, and its current strength if it is on the board. */
export interface Previewed {
  card: Card;
  power?: number;
}

interface PreviewApi {
  show: (item: Previewed) => void;
  hide: () => void;
}

const PreviewContext = createContext<PreviewApi>({ show: () => {}, hide: () => {} });

export const usePreview = (): PreviewApi => useContext(PreviewContext);

const SPECIAL_TEXT = {
  horn: "Commander's horn: doubles the strength of every non-hero unit in one of your rows.",
  decoy: "Decoy: swap with one of your units on the board and take that unit back to your hand.",
  scorch: "Scorch: destroys the strongest non-hero unit or units on the whole board.",
} as const;

const WEATHER_TEXT = {
  bitingFrost: "Biting frost: non-hero close combat units on both sides drop to strength 1.",
  impenetrableFog: "Impenetrable fog: non-hero ranged units on both sides drop to strength 1.",
  torrentialRain: "Torrential rain: non-hero siege units on both sides drop to strength 1.",
  skelligeStorm: "Skellige storm: non-hero ranged and siege units on both sides drop to strength 1.",
  clearWeather: "Clear weather: removes all weather effects.",
} as const;

/**
 * `panel` (the default) is the big card beside the board. `bar` is a slim description strip along the
 * bottom of the screen, for screens that already show the whole card, like the deck builder.
 */
export function CardPreview({ item, variant = "panel" }: { item: Previewed | null; variant?: "panel" | "bar" }) {
  if (!item) return null;
  const { card, power } = item;
  const unit = card.kind === "unit" ? card : null;
  const special = card.kind === "special" ? card : null;

  if (variant === "bar") {
    const lines: string[] = [];
    if (unit?.isHero) lines.push("Hero: not affected by weather, horn, bond, morale, scorch or decoy.");
    for (const a of unit?.abilities ?? []) lines.push(ABILITY_BADGE[a].help);
    if (unit && !unit.isHero && unit.abilities.length === 0) lines.push("No special ability.");
    if (special)
      lines.push(special.effect === "weather" ? WEATHER_TEXT[special.weather] : SPECIAL_TEXT[special.effect]);
    return (
      <aside className="preview-bar" aria-label="Card description" data-testid="preview">
        <strong className="preview-bar-name">{card.name}</strong>
        <span className="preview-bar-kind">
          {unit
            ? `${unit.isHero ? "Hero · " : ""}${ROW_LABEL[unit.row]} · strength ${unit.basePower}`
            : special?.effect === "weather"
              ? "Weather"
              : "Special"}
        </span>
        <span className="preview-bar-text">{lines.join(" ")}</span>
      </aside>
    );
  }
  const face = card.officialFace === true && card.art !== undefined;
  const shown = unit ? (power ?? unit.basePower) : null;
  const change =
    unit && shown !== null ? (shown > unit.basePower ? "boosted" : shown < unit.basePower ? "reduced" : "") : "";

  return (
    <aside
      className={`preview ${unit?.isHero ? "hero" : ""} ${unit ? "unit" : "special"}`}
      aria-label="Card preview"
      data-testid="preview"
    >
      {face ? (
        <div className="preview-face">
          <img src={card.art} alt="" />
          {unit && shown !== null && change !== "" && <span className={`power ${change}`}>{shown}</span>}
        </div>
      ) : (
        <div className="preview-art">
          <CardArt card={card} />
          {unit && shown !== null && <span className={`power ${change}`}>{shown}</span>}
          {unit && <RowIcon row={unit.row} className="row-icon" />}
        </div>
      )}
      {!face && <h3 className="preview-name">{card.name}</h3>}
      {face && <h3 className="preview-name">{card.name}</h3>}
      <p className="preview-kind">
        {unit
          ? `${unit.isHero ? "Hero · " : ""}${ROW_LABEL[unit.row]} · base strength ${unit.basePower}`
          : special?.effect === "weather"
            ? "Weather card"
            : "Special card"}
      </p>
      {unit && shown !== null && shown !== unit.basePower && <p className="preview-now">Now {shown}</p>}
      <ul className="preview-text">
        {unit?.isHero && <li>Hero: not affected by weather, horn, bond, morale, scorch or decoy.</li>}
        {unit?.abilities.map((a) => (
          <li key={a}>
            <span className="badge" style={{ background: ABILITY_BADGE[a].color }}>
              {ABILITY_BADGE[a].code}
            </span>
            {ABILITY_BADGE[a].help}
          </li>
        ))}
        {unit && !unit.isHero && unit.abilities.length === 0 && <li className="muted-small">No special ability.</li>}
        {special && (
          <li>{special.effect === "weather" ? WEATHER_TEXT[special.weather] : SPECIAL_TEXT[special.effect]}</li>
        )}
      </ul>
    </aside>
  );
}

/** Wraps the app so any card can ask for a large preview, which is shown by <PreviewSlot />. */
export function PreviewProvider({ children }: { children: (item: Previewed | null) => ReactNode }) {
  const [item, setItem] = useState<Previewed | null>(null);
  const api = useMemo<PreviewApi>(() => ({ show: setItem, hide: () => setItem(null) }), []);
  return <PreviewContext.Provider value={api}>{children(item)}</PreviewContext.Provider>;
}
