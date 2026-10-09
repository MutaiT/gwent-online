# Gwent Online

[![CI](https://github.com/MutaiT/gwent-online/actions/workflows/ci.yml/badge.svg)](https://github.com/MutaiT/gwent-online/actions/workflows/ci.yml)

A playable, browser-based card game based on the Witcher 3 Gwent rules.

**Play it: https://gwent-online.vercel.app**

**Status:** playable against a simple AI. The rules engine is
feature-complete and tested (match flow, special cards, unit abilities,
factions, leaders and deck validation), and there is a React board to play it
on. Multiplayer comes later. See [RULES.md](RULES.md) for what is implemented
and what still needs checking against the original game.

## How to play

```sh
npm install
npm run dev
```

Pick a faction and leader on the first screen (your opponent plays a random other
faction), redraw up to 2 cards from your opening hand, build your own deck with **Edit deck** (or just use the starter), then click a card in your hand, then click **Play** (or click the
card again). Cards that need a choice highlight where they can go: a horn or an
agile unit asks for a row on your side, a decoy asks for one of your units, and
a medic opens a list of units to bring back. Pass when you are happy with the
round, and use your leader once per match.

Hover (or focus) any card to see it large, with its abilities explained. Add
`?seed=123` to the address to replay the same shuffle.

## Deck builder

**Edit deck** on the first screen opens a collection-and-deck screen like the original's. Click a
card in the collection to add it (each card shows how many copies are left), click a card in your
deck to take it out, and click the leader to change leader. The rules follow the game: at least 22
unit cards, at most 10 special cards, only your faction's cards plus neutral ones, and a leader.
The screen shows your totals and says which rule a deck breaks. A legal deck is saved in your
browser automatically, one per faction; **Use the starter deck** on the menu forgets it.

## Cards and art

The game uses the real *Witcher 3* card list: all five factions, their leaders,
the neutral cards, and the special and weather cards, each with its official
card picture. Starter decks hold each faction's heroes, ability cards and strongest units plus some neutral and special cards.
Not yet supported: Skellige's Berserkers and Mardroeme, the Cow and Kambi's
"avenger" ability, and 11 of the 22 leaders (the ones that need new interface
for choosing cards).

Every card name, picture and trademark belongs to CD PROJEKT RED. This is an
unofficial fan project and is not affiliated with or endorsed by them; see
[ART_CREDITS.md](ART_CREDITS.md). The board picture, interface images and layout follow
[asundr/gwent-classic](https://github.com/asundr/gwent-classic); see
[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md). `src/data/demoCards.ts` also holds a second,
fully original deck pair with public-domain art, in case a build needs to avoid
the official pictures.

## Plan

1. **Rules engine**: pure TypeScript in `src/engine`, fully tested. Done.
2. **Single player**: a React board and an AI opponent. Playable now.
3. **Multiplayer**: online play with a server-authoritative WebSocket server
   that reuses the same engine.

## Layout

```
src/engine   rules: state, actions, scoring, decks (no UI)
src/ai       the opponent, which only ever picks from the engine's legal actions
src/data     the card catalogue, starter decks, deck-builder logic, and the original demo decks
src/ui       the React board (laid out on a 16:9 stage after asundr/gwent-classic)
```

## Develop

```sh
npm install
npm test          # engine, AI and UI tests
npm run typecheck
npm run dev       # play in the browser
npm run build
```

## Notes

This is an unofficial fan project and is not affiliated with or endorsed by
CD PROJEKT RED. Gwent and The Witcher are trademarks of CD PROJEKT S.A. The
engine implements the game's rules and the cards follow the original game.
