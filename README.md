# Gwent Online

A playable, browser-based card game based on the Witcher 3 Gwent rules.

**Status:** early. The rules engine is being built first, test-first, with no
UI dependency. See [RULES.md](RULES.md) for what is implemented.

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
