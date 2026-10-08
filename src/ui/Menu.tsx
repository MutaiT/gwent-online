import { useState } from "react";
import { FACTIONS, factionInfo, factionPortrait, leadersFor, unavailableLeaders, type MatchSetup } from "../data/decks";
import type { Faction } from "../engine/types";

interface MenuProps {
  onStart: (setup: MatchSetup) => void;
  /** Faction chosen last time, so the menu opens where you left off. */
  initial?: MatchSetup;
}

/** Pick a faction and a leader; the opponent gets a different faction at random. */
export function Menu({ onStart, initial }: MenuProps) {
  const [faction, setFaction] = useState<Faction>(initial?.player ?? "northernRealms");
  const [leaderId, setLeaderId] = useState<string | undefined>(initial?.playerLeader);

  const leaders = leadersFor(faction);
  const chosenLeader = leaders.find((l) => l.id === leaderId) ?? leaders[0];
  const blocked = unavailableLeaders(faction);

  const start = () => {
    const others = FACTIONS.filter((f) => f.id !== faction);
    const opponent = (others[Math.floor(Math.random() * others.length)] as (typeof others)[number]).id;
    onStart({ player: faction, opponent, playerLeader: chosenLeader?.id });
  };

  return (
    <main className="menu" aria-label="Choose your faction">
      <h1 className="menu-title">Gwent Online</h1>
      <h2>Choose your faction</h2>
      <div className="faction-grid" role="radiogroup" aria-label="Faction">
        {FACTIONS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={faction === f.id}
            className={`faction-card ${faction === f.id ? "chosen" : ""}`}
            onClick={() => {
              setFaction(f.id);
              setLeaderId(undefined);
            }}
          >
            <span className="faction-portrait">
              <img src={factionPortrait(f.id)} alt="" />
            </span>
            <span className="faction-name">{f.name}</span>
            <span className="faction-ability">{f.ability}</span>
          </button>
        ))}
      </div>

      <section className="leader-pick" aria-label="Leader">
        <h3>Leader for {factionInfo(faction).name}</h3>
        <div className="leader-tiles" role="radiogroup" aria-label="Leader">
          {leaders.map((l) => (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={chosenLeader?.id === l.id}
              className={`leader-tile ${chosenLeader?.id === l.id ? "chosen" : ""}`}
              onClick={() => setLeaderId(l.id)}
            >
              <img src={l.art} alt="" />
              <span>{l.name}</span>
            </button>
          ))}
          {blocked.map((l) => (
            <span key={l.id} className="leader-tile disabled" title="Not playable yet">
              <span>{l.name}</span>
              <small>coming soon</small>
            </span>
          ))}
        </div>
      </section>

      <div className="menu-actions">
        <button type="button" className="btn primary big" onClick={start}>
          Start game
        </button>
        <p className="muted-small">Your opponent will play a different faction, chosen at random.</p>
      </div>
    </main>
  );
}
