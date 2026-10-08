import type { Ability, Card, Faction, RowName } from "../engine/types";

export const FACTION_NAME: Record<Faction, string> = {
  northernRealms: "Northern Realms",
  nilfgaard: "Nilfgaardian Empire",
  scoiatael: "Scoia'tael",
  monsters: "Monsters",
  skellige: "Skellige",
};

/** A short code and colour for each ability badge. */
export const ABILITY_BADGE: Record<Ability, { code: string; color: string; label: string; help: string }> = {
  tightBond: { code: "B", color: "#7fa7d9", label: "Tight bond", help: "Tight bond: units with the same bond group in a row multiply each other's strength." },
  moraleBoost: { code: "M", color: "#7fcf8a", label: "Morale boost", help: "Morale boost: +1 to every other unit in the row." },
  horn: { code: "H", color: "#e0b350", label: "Horn", help: "Horn: doubles the other units in this row." },
  spy: { code: "S", color: "#b79be0", label: "Spy", help: "Spy: played on the opponent's side; you draw two cards." },
  medic: { code: "+", color: "#e07f7f", label: "Medic", help: "Medic: bring back a non-hero unit from your graveyard." },
  muster: { code: "U", color: "#d9a066", label: "Muster", help: "Muster: brings every card of the same group out of your deck." },
  scorch: { code: "X", color: "#e07a3a", label: "Scorch", help: "Scorch: destroys the strongest enemy units in the row if they total 10 or more." },
  agile: { code: "A", color: "#8fd0d0", label: "Agile", help: "Agile: can be played to close combat or ranged." },
};

/** A stable number from a name, so each card keeps the same colours. */
function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

/** A small line drawing for each row. These are placeholders, not artwork. */
export function RowIcon({ row, className }: { row: RowName; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {row === "close" && (
        <>
          <path d="M5 19 17 7M14 5l5 5M19 19 7 7M10 5 5 10" />
        </>
      )}
      {row === "ranged" && (
        <>
          <path d="M7 4c10 4 10 12 0 16M7 4v16M3 12h15M15 9l3 3-3 3" />
        </>
      )}
      {row === "siege" && (
        <>
          <circle cx="8" cy="17" r="3" />
          <path d="M8 17 19 6M16 4h5v5" />
        </>
      )}
    </svg>
  );
}

/**
 * Placeholder card art: a colour wash picked from the card's name, with a large
 * faint symbol. If the card has an `art` path, that image is shown instead.
 */
export function CardArt({ card }: { card: Card }) {
  if (card.art) {
    return <img className="art" src={card.art} alt="" loading="lazy" />;
  }
  const hue = hash(card.name) % 360;
  const special = card.kind === "special";
  const base = special ? 205 : hue;
  const style = {
    background: card.kind === "unit" && card.isHero
      ? `linear-gradient(160deg, hsl(${base} 45% 40%), hsl(${(base + 40) % 360} 55% 18%))`
      : `linear-gradient(160deg, hsl(${base} 32% ${special ? 34 : 30}%), hsl(${(base + 30) % 360} 38% 14%))`,
  };
  return (
    <span className="art placeholder" style={style} aria-hidden="true">
      {card.kind === "unit" ? (
        <RowIcon row={card.row} className="art-glyph" />
      ) : (
        <span className="art-glyph text">{card.effect === "weather" ? "❄" : card.effect === "horn" ? "♪" : card.effect === "decoy" ? "⇄" : "✹"}</span>
      )}
    </span>
  );
}
