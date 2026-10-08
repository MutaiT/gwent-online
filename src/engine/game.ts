import { describeDeckError, validateDeck } from "./deck";
import { shuffle, stepRandom, type Rng } from "./rng";
import { boardPower, unitPower } from "./scoring";
import {
  WEATHER_ROWS,
  emptyBoard,
  type Board,
  type Card,
  type Faction,
  type Leader,
  type PlayerId,
  type RowName,
  type SpecialCard,
  type UnitCard,
  type WeatherType,
} from "./types";

export type { PlayerId };

const ROW_NAMES: RowName[] = ["close", "ranged", "siege"];

export interface PlayerState {
  deck: Card[];
  hand: Card[];
  graveyard: Card[];
  board: Board;
  /** Special cards that stay on the table until the round ends (weather, horn, decoy). */
  inPlay: SpecialCard[];
  lives: number;
  /** Has passed in the current round and takes no more turns until it ends. */
  passed: boolean;
  faction: Faction | null;
  leader: Leader | null;
  leaderUsed: boolean;
}

export interface RoundResult {
  round: number;
  scores: [number, number];
  /** The winning player, or "draw" when scores were level and nobody won it. */
  winner: PlayerId | "draw";
}

/** A choice the current player must make before play continues. */
export type PendingChoice =
  | { type: "revive"; player: PlayerId }
  /** A Scoia'tael player picks who plays first. */
  | { type: "chooseFirst"; player: PlayerId };

export interface GameState {
  players: [PlayerState, PlayerState];
  round: number;
  /** Whose turn it is. */
  current: PlayerId;
  roundStarter: PlayerId;
  rounds: RoundResult[];
  status: "playing" | "finished";
  /** Set once the game is finished. */
  winner: PlayerId | "draw" | null;
  /** While set, only the matching choice may be made. */
  pending: PendingChoice | null;
  /** State of the game's own random generator (Monsters and Skellige use it). */
  rngState: number;
}

export type Action =
  | {
      type: "play";
      player: PlayerId;
      cardId: string;
      /** The row for a Commander's Horn, or for an agile unit (close or ranged). */
      row?: RowName;
      /** The unit on your own board that a Decoy swaps back to your hand. */
      targetId?: string;
    }
  | { type: "pass"; player: PlayerId }
  /** Use your leader's ability (once per match). */
  | { type: "leader"; player: PlayerId }
  /** Resolve a medic: choose a non-hero unit from your own graveyard. */
  | { type: "revive"; player: PlayerId; cardId: string }
  /** Resolve Scoia'tael's choice of who goes first. */
  | { type: "chooseFirst"; player: PlayerId; first: PlayerId };

export type Result = { ok: true; state: GameState } | { ok: false; error: string };

export const STARTING_LIVES = 2;
export const HAND_SIZE = 10;

export function other(player: PlayerId): PlayerId {
  return player === 0 ? 1 : 0;
}

/** Decides who plays first in round 1 when nobody has a say. */
export function coinToss(rng: Rng): PlayerId {
  return rng() < 0.5 ? 0 : 1;
}

export interface NewGameOptions {
  decks: [Card[], Card[]];
  /**
   * Who plays first. Leave it out to follow the rules: if exactly one player is
   * Scoia'tael they choose (the game waits for a `chooseFirst` action),
   * otherwise it is a coin toss.
   */
  firstPlayer?: PlayerId;
  rng: Rng;
  handSize?: number;
  factions?: [Faction | null, Faction | null];
  leaders?: [Leader | null, Leader | null];
  /**
   * Check each deck against the deck-building rules and throw if one is invalid.
   * Needs a faction for each player, and a leader unless the deck is for a casual game.
   * Off by default so tests and experiments can use small decks.
   */
  validateDecks?: boolean;
}

function newPlayer(
  deck: Card[],
  handSize: number,
  rng: Rng,
  faction: Faction | null,
  leader: Leader | null,
): PlayerState {
  if (deck.length < handSize) {
    throw new RangeError(`A deck needs at least ${handSize} cards, got ${deck.length}`);
  }
  const shuffled = shuffle(deck, rng);
  return {
    hand: shuffled.slice(0, handSize),
    deck: shuffled.slice(handSize),
    graveyard: [],
    board: emptyBoard(),
    inPlay: [],
    lives: STARTING_LIVES,
    passed: false,
    faction,
    leader,
    leaderUsed: false,
  };
}

export function newGame({
  decks,
  firstPlayer,
  rng,
  handSize = HAND_SIZE,
  factions = [null, null],
  leaders = [null, null],
  validateDecks = false,
}: NewGameOptions): GameState {
  if (validateDecks) {
    for (const side of [0, 1] as const) {
      const faction = factions[side];
      if (faction === null) throw new RangeError(`Player ${side} needs a faction to validate their deck`);
      const result = validateDeck(decks[side], faction, leaders[side]);
      if (!result.valid) {
        throw new RangeError(`Player ${side}'s deck is not valid: ${result.errors.map(describeDeckError).join("; ")}`);
      }
    }
  }

  const players: [PlayerState, PlayerState] = [
    newPlayer(decks[0], handSize, rng, factions[0], leaders[0]),
    newPlayer(decks[1], handSize, rng, factions[1], leaders[1]),
  ];
  const rngState = Math.floor(rng() * 4294967296) >>> 0;

  const scoiatael = players.map((p) => p.faction === "scoiatael");
  let pending: PendingChoice | null = null;
  let first: PlayerId;
  if (firstPlayer !== undefined) {
    first = firstPlayer;
  } else if (scoiatael[0] !== scoiatael[1]) {
    first = scoiatael[0] ? 0 : 1;
    pending = { type: "chooseFirst", player: first };
  } else {
    first = coinToss(rng);
  }

  return {
    players,
    round: 1,
    current: first,
    roundStarter: first,
    rounds: [],
    status: "playing",
    winner: null,
    pending,
    rngState,
  };
}

function fail(error: string): Result {
  return { ok: false, error };
}

/** A random integer in [0, n), advancing the game's own generator. */
function randomInt(state: GameState, n: number): number {
  const step = stepRandom(state.rngState);
  state.rngState = step.state;
  return Math.floor(step.value * n);
}

/** Shuffles in place with the game's own generator, so it stays replayable. */
function shuffleWithGame<T>(state: GameState, items: T[]): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(state, i + 1);
    const held = items[i] as T;
    items[i] = items[j] as T;
    items[j] = held;
  }
}

/** Which player a unit belongs to: who played it, or the side it sits on if unknown. */
function ownerOf(unit: UnitCard, side: PlayerId): PlayerId {
  return unit.owner ?? side;
}

function revivable(player: PlayerState): UnitCard[] {
  return player.graveyard.filter((c): c is UnitCard => c.kind === "unit" && !c.isHero);
}

/** Destroys the given units. Each goes to the graveyard of the side it was on. */
function destroy(state: GameState, doomed: { side: PlayerId; row: RowName; unit: UnitCard }[]): void {
  for (const { side, row, unit } of doomed) {
    const board = state.players[side].board[row];
    board.units = board.units.filter((u) => u !== unit);
    state.players[side].graveyard.push(unit);
  }
}

/**
 * Scorch restricted to one enemy row: destroys the strongest enemy non-hero
 * unit(s) there if the enemy's own units in that row total 10 or more.
 * Used by scorch units and by scorch leaders.
 */
function scorchRow(state: GameState, playerId: PlayerId, row: RowName): void {
  const opponentId = other(playerId);
  const enemyRow = state.players[opponentId].board[row];
  const enemies = enemyRow.units.filter((u) => ownerOf(u, opponentId) === opponentId);
  const total = enemies.reduce((sum, u) => sum + unitPower(enemyRow, u), 0);
  if (total < 10) return;
  const targets = enemies
    .filter((u) => !u.isHero)
    .map((unit) => ({ unit, power: unitPower(enemyRow, unit) }));
  const strongest = Math.max(...targets.map((t) => t.power));
  destroy(
    state,
    targets.filter((t) => t.power === strongest).map((t) => ({ side: opponentId, row, unit: t.unit })),
  );
}

/**
 * Weather on both sides. Clear Weather removes it all, and sends weather cards
 * (and the Clear Weather card itself, if there is one) to the graveyard.
 */
function applyWeather(state: GameState, me: PlayerState, weather: WeatherType, card: SpecialCard | null): void {
  if (weather === "clearWeather") {
    for (const player of state.players) {
      for (const name of ROW_NAMES) player.board[name].weather = false;
      player.graveyard.push(...player.inPlay.filter((c) => c.effect === "weather"));
      player.inPlay = player.inPlay.filter((c) => c.effect !== "weather");
    }
    if (card) me.graveyard.push(card);
  } else {
    for (const player of state.players) {
      for (const name of WEATHER_ROWS[weather]) player.board[name].weather = true;
    }
    if (card) me.inPlay.push(card);
  }
}

/**
 * Puts a unit onto the board and runs its on-play abilities. Used for cards
 * played from the hand and for units revived by a medic.
 *
 *  - spy: goes to the opponent's board, and its owner draws two cards
 *  - muster: every card with the same muster group comes out of the deck
 *    (placed without triggering its own abilities)
 *  - scorch: see scorchRow
 *  - medic: the owner must now choose a unit to revive, if there is one
 */
function deployUnit(state: GameState, playerId: PlayerId, card: UnitCard, row: RowName): void {
  const me = state.players[playerId];
  const sideId = card.abilities.includes("spy") ? other(playerId) : playerId;

  state.players[sideId].board[row].units.push({ ...card, owner: playerId });

  if (card.abilities.includes("spy")) {
    me.hand.push(...me.deck.splice(0, 2));
  }

  if (card.abilities.includes("muster") && card.musterGroup !== undefined) {
    const mates = me.deck.filter(
      (c): c is UnitCard => c.kind === "unit" && c.musterGroup === card.musterGroup,
    );
    me.deck = me.deck.filter((c) => !mates.includes(c as UnitCard));
    for (const mate of mates) {
      me.board[mate.row].units.push({ ...mate, owner: playerId });
    }
  }

  if (card.abilities.includes("scorch")) {
    scorchRow(state, playerId, row);
  }

  if (card.abilities.includes("medic") && revivable(me).length > 0) {
    state.pending = { type: "revive", player: playerId };
  }
}

function playSpecial(
  state: GameState,
  playerId: PlayerId,
  card: SpecialCard,
  action: Extract<Action, { type: "play" }>,
): string | null {
  const me = state.players[playerId];

  switch (card.effect) {
    case "weather": {
      applyWeather(state, me, card.weather, card);
      return null;
    }

    case "horn": {
      if (!action.row) return "Choose a row for the horn";
      if (me.board[action.row].hornCard) return "That row already has a horn";
      me.board[action.row].hornCard = true;
      me.inPlay.push(card);
      return null;
    }

    case "decoy": {
      if (!action.targetId) return "Choose a unit to swap with the decoy";
      for (const name of ROW_NAMES) {
        const units = me.board[name].units;
        const index = units.findIndex((u) => u.id === action.targetId);
        if (index === -1) continue;
        const target = units[index] as UnitCard;
        // A spy on your side was played by your opponent: you cannot take it.
        if (ownerOf(target, playerId) !== playerId) return "That unit is not on your board";
        if (target.isHero) return "A hero cannot be swapped";
        units.splice(index, 1);
        me.hand.push(target);
        me.inPlay.push(card);
        return null;
      }
      return "That unit is not on your board";
    }

    case "scorch": {
      const candidates = state.players.flatMap((player, side) =>
        ROW_NAMES.flatMap((row) =>
          player.board[row].units
            .filter((unit) => !unit.isHero)
            .map((unit) => ({ side: side as PlayerId, row, unit, power: unitPower(player.board[row], unit) })),
        ),
      );
      const strongest = Math.max(...candidates.map((c) => c.power));
      destroy(state, candidates.filter((c) => c.power === strongest));
      me.graveyard.push(card);
      return null;
    }
  }
}

/** The first weather card of this kind in a deck, if there is one. */
function weatherInDeck(player: PlayerState, weather: WeatherType): SpecialCard | undefined {
  return player.deck.find(
    (c): c is SpecialCard & { effect: "weather" } => c.kind === "special" && c.effect === "weather" && c.weather === weather,
  );
}

/** Why the player's leader cannot be used right now, or null if it can. */
function leaderBlocked(state: GameState, playerId: PlayerId): string | null {
  const me = state.players[playerId];
  const leader = me.leader;
  if (!leader) return "You have no leader";
  if (me.leaderUsed) return "Your leader has already been used";
  const effect = leader.effect;
  if (effect.type === "horn" && me.board[effect.row].hornCard) return "That row already has a horn";
  if (effect.type === "playWeather" && !weatherInDeck(me, effect.weather)) return "That weather card is not in your deck";
  return null;
}

/** Uses the player's leader. Returns an error message if it cannot be used. */
function useLeader(state: GameState, playerId: PlayerId): string | null {
  const blocked = leaderBlocked(state, playerId);
  if (blocked) return blocked;
  const me = state.players[playerId];
  const effect = (me.leader as Leader).effect;

  switch (effect.type) {
    case "horn":
      me.board[effect.row].hornCard = true;
      break;
    case "weather":
      applyWeather(state, me, effect.weather, null);
      break;
    case "scorchRow":
      scorchRow(state, playerId, effect.row);
      break;
    case "playWeather": {
      const card = weatherInDeck(me, effect.weather) as SpecialCard & { effect: "weather" };
      me.deck.splice(me.deck.indexOf(card), 1);
      applyWeather(state, me, effect.weather, card);
      break;
    }
    case "shuffleGraveyards":
      for (const player of state.players) {
        player.deck.push(...player.graveyard);
        player.graveyard = [];
        shuffleWithGame(state, player.deck);
      }
      break;
  }
  me.leaderUsed = true;
  return null;
}

/** Ends the turn: finish the round if both have passed, otherwise hand over play. */
function finishTurn(state: GameState, playerId: PlayerId): GameState {
  const me = state.players[playerId];
  const opponent = state.players[other(playerId)];
  if (me.passed && opponent.passed) return endRound(state);
  // Play alternates, unless the opponent has passed: then this player keeps going.
  state.current = opponent.passed ? playerId : other(playerId);
  return state;
}

/**
 * Applies one action and returns the new state. The input state is never
 * modified, and an illegal action returns an error instead of throwing.
 */
export function applyAction(state: GameState, action: Action): Result {
  if (state.status === "finished") return fail("The game is over");
  if (action.player !== state.current) return fail("It is not your turn");

  if (state.pending?.type === "revive" && action.type !== "revive") return fail("Choose a unit to revive first");
  if (state.pending?.type === "chooseFirst" && action.type !== "chooseFirst") return fail("Choose who goes first");

  const next = structuredClone(state);
  const me = next.players[action.player];

  if (action.type === "chooseFirst") {
    if (next.pending?.type !== "chooseFirst") return fail("Nobody needs to choose who goes first");
    next.pending = null;
    next.current = action.first;
    next.roundStarter = action.first;
    return { ok: true, state: next };
  }

  if (action.type === "revive") {
    if (next.pending?.type !== "revive") return fail("There is nothing to revive");
    const target = revivable(me).find((c) => c.id === action.cardId);
    if (!target) return fail("Choose a non-hero unit from your graveyard");
    me.graveyard.splice(me.graveyard.indexOf(target), 1);
    next.pending = null;
    deployUnit(next, action.player, target, target.row);
    return { ok: true, state: next.pending ? next : finishTurn(next, action.player) };
  }

  if (action.type === "leader") {
    const error = useLeader(next, action.player);
    if (error) return fail(error);
  } else if (action.type === "play") {
    const index = me.hand.findIndex((card) => card.id === action.cardId);
    const card = index === -1 ? undefined : me.hand[index];
    if (!card) return fail("That card is not in your hand");

    if (card.kind === "unit") {
      const row = action.row ?? card.row;
      const allowed: RowName[] = card.abilities.includes("agile") ? ["close", "ranged"] : [card.row];
      if (!allowed.includes(row)) return fail(`That card cannot be played to the ${row} row`);
      me.hand.splice(index, 1);
      deployUnit(next, action.player, card, row);
    } else {
      me.hand.splice(index, 1);
      const error = playSpecial(next, action.player, card, action);
      if (error) return fail(error);
    }
  } else {
    me.passed = true;
  }

  return { ok: true, state: next.pending ? next : finishTurn(next, action.player) };
}

/** Every action the current player may take. Used by the AI and the UI. */
export function legalActions(state: GameState): Action[] {
  if (state.status === "finished") return [];
  const player = state.current;
  const me = state.players[player];

  if (state.pending?.type === "chooseFirst") {
    return ([0, 1] as const).map((first): Action => ({ type: "chooseFirst", player, first }));
  }
  if (state.pending?.type === "revive") {
    return revivable(me).map((card): Action => ({ type: "revive", player, cardId: card.id }));
  }

  const actions: Action[] = [];
  for (const card of me.hand) {
    if (card.kind === "unit") {
      if (card.abilities.includes("agile")) {
        actions.push({ type: "play", player, cardId: card.id, row: "close" });
        actions.push({ type: "play", player, cardId: card.id, row: "ranged" });
      } else {
        actions.push({ type: "play", player, cardId: card.id });
      }
    } else if (card.effect === "horn") {
      for (const row of ROW_NAMES) {
        if (!me.board[row].hornCard) actions.push({ type: "play", player, cardId: card.id, row });
      }
    } else if (card.effect === "decoy") {
      for (const row of ROW_NAMES) {
        for (const unit of me.board[row].units) {
          if (!unit.isHero && ownerOf(unit, player) === player) {
            actions.push({ type: "play", player, cardId: card.id, targetId: unit.id });
          }
        }
      }
    } else {
      actions.push({ type: "play", player, cardId: card.id });
    }
  }

  if (leaderBlocked(state, player) === null) actions.push({ type: "leader", player });

  actions.push({ type: "pass", player });
  return actions;
}

/**
 * Who starts the next round.
 *
 * ASSUMPTION, check against the original game: the winner of the round starts
 * the next one, and after a draw the same player starts again.
 */
function nextRoundStarter(previous: PlayerId, winner: PlayerId | "draw"): PlayerId {
  return winner === "draw" ? previous : winner;
}

function endRound(state: GameState): GameState {
  const [a, b] = state.players;
  const scores: [number, number] = [boardPower(a.board), boardPower(b.board)];
  let winner: PlayerId | "draw" = scores[0] === scores[1] ? "draw" : scores[0] > scores[1] ? 0 : 1;

  // Nilfgaard wins ties, unless both players are Nilfgaard.
  if (winner === "draw" && (a.faction === "nilfgaard") !== (b.faction === "nilfgaard")) {
    winner = a.faction === "nilfgaard" ? 0 : 1;
  }

  // The loser loses a life; on a draw both do.
  if (winner !== 1) b.lives -= 1;
  if (winner !== 0) a.lives -= 1;

  const finished = a.lives <= 0 || b.lives <= 0;

  // Monsters keep one random unit of their own on the board for the next round.
  const kept: ({ row: RowName; unit: UnitCard } | null)[] = state.players.map((player, side) => {
    if (finished || player.faction !== "monsters") return null;
    const own = ROW_NAMES.flatMap((row) =>
      player.board[row].units
        .filter((unit) => ownerOf(unit, side as PlayerId) === side)
        .map((unit) => ({ row, unit })),
    );
    return own.length > 0 ? (own[randomInt(state, own.length)] ?? null) : null;
  });

  // Units go to the graveyard of the side they were on, so a spy lands in the
  // opponent's graveyard and their medic can bring it back.
  state.players.forEach((player, side) => {
    const keep = kept[side]?.unit;
    for (const row of ROW_NAMES) {
      player.graveyard.push(...player.board[row].units.filter((u) => u !== keep));
    }
    player.graveyard.push(...player.inPlay);
    player.inPlay = [];
    player.board = emptyBoard();
    player.passed = false;
    const k = kept[side];
    if (k) player.board[k.row].units.push(k.unit);
  });

  state.rounds.push({ round: state.round, scores, winner });

  if (finished) {
    state.status = "finished";
    state.winner = a.lives <= 0 && b.lives <= 0 ? "draw" : a.lives <= 0 ? 1 : 0;
    return state;
  }

  // Northern Realms draw a card for winning a round.
  if (winner !== "draw" && state.players[winner].faction === "northernRealms") {
    const winnerState = state.players[winner];
    winnerState.hand.push(...winnerState.deck.splice(0, 1));
  }

  state.round += 1;
  state.roundStarter = nextRoundStarter(state.roundStarter, winner);
  state.current = state.roundStarter;

  // Skellige bring two random units back from the graveyard at the start of round 3.
  if (state.round === 3) {
    for (const player of state.players) {
      if (player.faction !== "skellige") continue;
      for (let i = 0; i < 2; i++) {
        const options = revivable(player);
        if (options.length === 0) break;
        const unit = options[randomInt(state, options.length)] as UnitCard;
        player.graveyard.splice(player.graveyard.indexOf(unit), 1);
        player.board[unit.row].units.push({ ...unit, owner: state.players.indexOf(player) as PlayerId });
      }
    }
  }

  return state;
}
