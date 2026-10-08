# Gwent Online

[![CI](https://github.com/MutaiT/gwent-online/actions/workflows/ci.yml/badge.svg)](https://github.com/MutaiT/gwent-online/actions/workflows/ci.yml)

A playable, browser-based card game based on the Witcher 3 Gwent rules.

**Status:** the rules engine is feature-complete and tested (match flow,
special cards, unit abilities, factions, leaders and deck validation). The
playable UI is next. See [RULES.md](RULES.md) for what is implemented and what
still needs checking against the original game.

## Plan

1. **Rules engine**: pure TypeScript in `src/engine`, fully tested.
2. **Single player**: play against an AI in the browser.
3. **Multiplayer**: online play with a server-authoritative WebSocket server
   that reuses the same engine.

## Develop

```sh
npm install
npm test          # run the engine tests
npm run typecheck
npm run dev       # placeholder page for now
npm run build
```

## Notes

This is an unofficial fan project and is not affiliated with or endorsed by
CD PROJEKT RED. Gwent and The Witcher are trademarks of CD PROJEKT S.A. The
engine implements the game's rules.
