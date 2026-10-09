import { useEffect, useMemo, useState } from "react";
import { CATALOG, type CatalogEntry } from "../data/catalog";
import { checkDeck, groupByName, loadSavedDeck, saveDeck, sortEntries, starterIds } from "../data/deckBuilder";
import { collectionFor, factionInfo, leadersFor, toCard } from "../data/decks";
import { MAX_SPECIAL_CARDS, MIN_UNIT_CARDS } from "../engine/deck";
import type { Faction } from "../engine/types";
import { CardView } from "./CardView";
import { CardPreview, PreviewProvider } from "./preview";

interface DeckBuilderProps {
  faction: Faction;
  leaderId: string | undefined;
  onLeader: (id: string) => void;
  onBack: () => void;
  /** Called with your deck's card ids when you press Start game. */
  onStart: (deck: string[]) => void;
}

const entryById = new Map(CATALOG.map((e) => [e.id, e]));

/** Pick the cards for your deck from the faction's collection, with the rules and stats alongside. */
export function DeckBuilder({ faction, leaderId, onLeader, onBack, onStart }: DeckBuilderProps) {
  const collection = useMemo(() => collectionFor(faction), [faction]);
  const leaders = leadersFor(faction);
  const leader = leaders.find((l) => l.id === leaderId) ?? leaders[0];

  const [deckIds, setDeckIds] = useState<string[]>(() => loadSavedDeck(faction) ?? starterIds(faction));

  const deck = useMemo(() => deckIds.flatMap((id) => entryById.get(id) ?? []), [deckIds]);
  const inDeck = useMemo(() => new Set(deckIds), [deckIds]);
  const check = checkDeck(faction, leader?.id, deck);

  // Keep the deck while it is legal, so closing the page never loses a finished deck.
  useEffect(() => {
    if (check.valid) saveDeck(faction, deckIds);
  }, [check.valid, deckIds, faction]);

  const collectionGroups = useMemo(() => groupByName(collection), [collection]);
  const deckGroups = useMemo(() => groupByName(sortEntries(deck)), [deck]);

  const add = (entry: CatalogEntry) => setDeckIds((ids) => (ids.includes(entry.id) ? ids : [...ids, entry.id]));
  const remove = (entry: CatalogEntry) => setDeckIds((ids) => ids.filter((id) => id !== entry.id));
  const reset = () => setDeckIds(starterIds(faction));

  const nextLeader = () => {
    if (leaders.length === 0) return;
    const at = leaders.findIndex((l) => l.id === leader?.id);
    onLeader((leaders[(at + 1) % leaders.length] as (typeof leaders)[number]).id);
  };

  const info = factionInfo(faction);
  const startReason = check.valid ? "" : (check.problems[0] ?? "");

  return (
    <PreviewProvider>
      {(previewed) => (
        <main className="builder" aria-label="Deck builder">
          <CardPreview item={previewed} variant="bar" />

          <section className="builder-list" aria-label="Card collection">
            <h2>Card Collection</h2>
            <div className="builder-cards">
              {collectionGroups.map((group) => {
                const free = group.entries.filter((e) => !inDeck.has(e.id));
                const next = free[0];
                const sample = next ?? (group.entries[0] as CatalogEntry);
                return (
                  <div key={group.name} className={`builder-tile ${next ? "" : "all-used"}`}>
                    <CardView
                      card={toCard(sample, "b-")}
                      size="list"
                      dimmed={!next}
                      onClick={next ? () => add(next) : undefined}
                      testId={`collect-${group.name}`}
                    />
                    <span className="builder-count" aria-hidden="true" data-testid={`collect-count-${group.name}`}>
                      ×{free.length}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="builder-centre" aria-label="Deck details">
            <h2 className="builder-faction">{info.name}</h2>
            <p className="builder-ability">{info.ability}</p>

            <div className="builder-leader">
              <span className="builder-label">Leader</span>
              {leader ? (
                <button
                  type="button"
                  className="leader-pick"
                  onClick={nextLeader}
                  aria-label={`Leader: ${leader.name}. Click for the next leader.`}
                  title="Click to change leader"
                >
                  <img src={leader.art} alt="" />
                </button>
              ) : (
                <span className="muted-small">none available</span>
              )}
              <span className="builder-leader-name">{leader?.name}</span>
            </div>

            <dl className="builder-stats">
              <dt>Total cards in deck</dt>
              <dd data-testid="stat-cards">{check.stats.cards}</dd>
              <dt>Number of unit cards</dt>
              <dd data-testid="stat-units" className={check.stats.units < MIN_UNIT_CARDS ? "bad" : ""}>
                {check.stats.units}
                <small> / min {MIN_UNIT_CARDS}</small>
              </dd>
              <dt>Special cards</dt>
              <dd data-testid="stat-specials" className={check.stats.specials > MAX_SPECIAL_CARDS ? "bad" : ""}>
                {check.stats.specials}/{MAX_SPECIAL_CARDS}
              </dd>
              <dt>Total unit card strength</dt>
              <dd data-testid="stat-strength">{check.stats.strength}</dd>
              <dt>Hero cards</dt>
              <dd data-testid="stat-heroes">{check.stats.heroes}</dd>
            </dl>

            <p className={`builder-problems ${check.valid ? "ok" : ""}`} role="status" data-testid="builder-status">
              {check.valid ? "Deck is ready." : check.problems.join(". ")}
            </p>
            <p className="muted-small">
              Click a card to add it. Click a card in your deck to take it out. A legal deck is saved automatically.
            </p>

            <div className="builder-buttons">
              <button
                type="button"
                className="btn primary big"
                disabled={!check.valid}
                title={startReason}
                onClick={() => onStart(deckIds)}
              >
                Start game
              </button>
              <button type="button" className="btn" onClick={reset}>
                Reset to starter deck
              </button>
              <button type="button" className="btn" onClick={onBack}>
                Back
              </button>
            </div>
          </section>

          <section className="builder-list" aria-label="Cards in deck">
            <h2>Cards in Deck</h2>
            <div className="builder-cards">
              {deckGroups.map((group) => (
                <div key={group.name} className="builder-tile">
                  <CardView
                    card={toCard(group.entries[0] as CatalogEntry, "b-")}
                    size="list"
                    onClick={() => remove(group.entries[group.entries.length - 1] as CatalogEntry)}
                    testId={`deck-${group.name}`}
                  />
                  <span className="builder-count" aria-hidden="true" data-testid={`deck-count-${group.name}`}>
                    ×{group.entries.length}
                  </span>
                </div>
              ))}
              {deck.length === 0 && <p className="muted-small">No cards yet. Click cards on the left to add them.</p>}
            </div>
          </section>
        </main>
      )}
    </PreviewProvider>
  );
}
