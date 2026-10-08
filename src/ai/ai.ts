import { applyAction, legalActions, other, type Action, type GameState, type PlayerId } from "../engine/game";
import { stepRandom } from "../engine/rng";
import { boardPower } from "../engine/scoring";
import type { Card, UnitCard } from "../engine/types";

export interface AiChoice {
  action: Action;
  /** The AI's own random seed, advanced. Pass it back in on the next call. */
  seed: number;
}

/** How far ahead the AI is content to be before it passes with cards still in hand. */
const COMFORTABLE_LEAD = 15;

function lead(state: GameState, me: PlayerId): number {
  return boardPower(state.players[me].board) - boardPower(state.players[other(me)].board);
}

/** A rough price for spending a card, so the AI prefers cheap ways to get ahead. */
function cost(state: GameState, action: Action): number {
  if (action.type === "pass") return 0;
  if (action.type === "leader") return 4;
  if (action.type !== "play") return 0;
  const card = state.players[action.player].hand.find((c) => c.id === action.cardId);
  return card?.kind === "unit" ? card.basePower : 5;
}

/** How much the AI values a card in its opening hand. Low-value cards are worth swapping. */
function worth(card: Card): number {
  if (card.kind === "unit") return (card.isHero ? 20 : 0) + card.basePower + card.abilities.length * 4;
  if (card.effect === "weather") return card.weather === "clearWeather" ? 2 : 3;
  return { horn: 12, scorch: 10, decoy: 6 }[card.effect];
}

/** Swap the weakest card while it is a throwaway (a plain weak unit or a weather card). */
const REDRAW_BELOW = 4;

/**
 * A simple opponent: it never cheats, it only picks from `legalActions`.
 *
 *  - once you have passed, it plays the cheapest card that puts it ahead, or
 *    passes if it is already ahead (or cannot catch up)
 *  - before that, it catches up with its strongest play when behind, spends
 *    cheaply when ahead, and passes when comfortably ahead or out of useful plays
 *
 * It looks one action ahead using the real engine, so abilities count.
 */
export function chooseAction(state: GameState, seed: number): AiChoice {
  let rngState = seed;
  const random = (n: number): number => {
    const step = stepRandom(rngState);
    rngState = step.state;
    return Math.floor(step.value * n);
  };
  const done = (action: Action): AiChoice => ({ action, seed: rngState });

  const me = state.current;
  const opponent = other(me);
  const actions = legalActions(state);

  if (state.pending?.type === "chooseFirst") {
    return done({ type: "chooseFirst", player: me, first: me });
  }
  if (state.pending?.type === "redraw") {
    const hand = state.players[me].hand;
    const weakest = hand.reduce((a, b) => (worth(b) < worth(a) ? b : a));
    return done(
      worth(weakest) < REDRAW_BELOW
        ? { type: "redraw", player: me, cardId: weakest.id }
        : { type: "keepHand", player: me },
    );
  }
  if (state.pending?.type === "revive") {
    const options = actions.filter((a): a is Extract<Action, { type: "revive" }> => a.type === "revive");
    const power = (a: Extract<Action, { type: "revive" }>): number =>
      (state.players[me].graveyard.find((c) => c.id === a.cardId) as UnitCard | undefined)?.basePower ?? 0;
    const best = options.reduce((a, b) => (power(b) > power(a) ? b : a));
    return done(best);
  }

  const pass: Action = { type: "pass", player: me };
  const currentLead = lead(state, me);

  const plays = actions
    .filter((a) => a.type !== "pass")
    .flatMap((action) => {
      const result = applyAction(state, action);
      if (!result.ok) return [];
      const after = lead(result.state, me);
      return [{ action, after, gain: after - currentLead, cost: cost(state, action) }];
    });

  if (plays.length === 0) return done(pass);

  const pickCheapest = <T extends { cost: number }>(options: T[]): T => {
    const cheapest = Math.min(...options.map((o) => o.cost));
    const ties = options.filter((o) => o.cost === cheapest);
    return ties[random(ties.length)] as T;
  };
  const pickBiggestGain = <T extends { gain: number }>(options: T[]): T => {
    const most = Math.max(...options.map((o) => o.gain));
    const ties = options.filter((o) => o.gain === most);
    return ties[random(ties.length)] as T;
  };

  if (state.players[opponent].passed) {
    if (currentLead > 0) return done(pass);
    const winning = plays.filter((p) => p.after > 0);
    if (winning.length > 0) return done(pickCheapest(winning).action);
    // No single card wins it. Keep going only if a few strong plays could.
    const reach = [...plays].sort((a, b) => b.gain - a.gain).slice(0, 3).reduce((sum, p) => sum + p.gain, 0);
    if (currentLead + reach > 0) return done(pickBiggestGain(plays).action);
    return done(pass);
  }

  if (currentLead >= COMFORTABLE_LEAD) return done(pass);
  const useful = plays.filter((p) => p.gain > 0);
  if (useful.length === 0) return done(pass);
  return done(currentLead <= 0 ? pickBiggestGain(useful).action : pickCheapest(useful).action);
}
