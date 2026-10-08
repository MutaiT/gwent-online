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
faction), then click a card in your hand, then click **Play** (or click the
card again). Cards that need a choice highlight where they can go: a horn or an
agile unit asks for a row on your side, a decoy asks for one of your units, and
a medic opens a list of units to bring back. Pass when you are happy with the
round, and use your leader once per match.

Hover (or focus) any card to see it large, with its abilities explained. Add
`?seed=123` to the address to replay the same shuffle.

## Cards and art

The game uses the real *Witcher 3* card list: all five factions, their leaders,
the neutral cards, and the special and weather cards, each with its official
card picture. Starter decks are built from the cards the engine fully supports.
Not yet supported: Skellige's Berserkers and Mardroeme, the Cow and Kambi's
"avenger" ability, and 11 of the 22 leaders (the ones that need new interface
for choosing cards).

Every card name, picture and trademark belongs to CD PROJEKT RED. This is an
unofficial fan project and is not affiliated with or endorsed by them; see
[ART_CREDITS.md](ART_CREDITS.md). `src/data/demoCards.ts` also holds a second,
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
src/data     the card catalogue, starter decks, and the original demo decks
src/ui       the React board
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
