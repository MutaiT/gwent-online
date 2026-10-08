# Rules spec

The game follows the card game as played in The Witcher 3: Wild Hunt. This file
is the engine's checklist. **Written from memory of the original rules: check it
against the game and correct anything that differs before relying on it.**

Status: `[x]` implemented and tested, `[ ]` not yet.

## Match flow
- [x] Two players, each with a deck and a hand of 10 cards (leader cards: not yet)
- [x] Coin toss decides who plays first in round 1
- [x] Best of three rounds; each player has two lives and loses one by losing a round
- [x] A drawn round costs both players a life
- [x] On their turn a player plays one card, or passes; once passed, a player takes no more turns in that round
- [x] If the opponent has passed, the other player keeps taking turns
- [x] The round ends when both players have passed; the higher total wins
- [x] Cards on the board go to the graveyard at the end of each round
- [x] Hands carry over between rounds (no redraw except through abilities)
- [x] The game ends when a player has no lives left; both at zero is a draw
- [ ] **Verify:** who starts rounds 2 and 3. The engine currently has the round winner start, and the same player start again after a draw. This is my assumption: check it against the original game.

## Board and scoring
- [x] Each side has three rows: close combat, ranged, siege
- [x] A row's strength is the sum of its units' current strengths
- [x] A side's score is the sum of its three rows
- [x] Order of effects on a unit: weather, tight bond, morale boost, horn
- [x] Heroes are immune to weather, bond, morale boost and horn

## Special cards
- [x] Weather sets non-hero units in the affected row to 1 (both players' rows)
  - Biting Frost: close combat
  - Impenetrable Fog: ranged
  - Torrential Rain: siege
  - Skellige Storm: ranged and siege
  - Clear Weather: removes all weather
- [x] Weather lasts until Clear Weather or the end of the round
- [x] Commander's Horn doubles the units in one row (does not stack); one horn per row
- [x] Decoy: swap with a non-hero unit on your board, returning it to your hand
- [x] Scorch: destroy the strongest non-hero unit(s), both sides, ties included, judged by current strength
- [ ] **Verify:** Decoy currently returns the unit to hand and the Decoy card is kept aside until the round ends. In the original, the Decoy takes the unit's place on its row. Scoring is the same either way.

## Unit abilities
- [x] Tight bond: same-group units in a row multiply each other
- [x] Morale boost: +1 to every other unit in the row
- [x] Horn (unit): doubles the other units in its row
- [x] Spy: placed on the opponent's board (scores for them); its owner draws 2 cards; returns to its owner's graveyard
- [x] Medic: on play, choose a non-hero unit from your graveyard to put back on the board; a revived unit's own ability runs, so a revived medic asks again
- [x] Muster: when played, every card with the same muster group comes out of the deck
- [x] Agile: may be played to close combat or ranged
- [x] Scorch (unit): destroys the strongest enemy non-hero unit(s) in the same row, if the enemy's units there total 10 or more
- [ ] **Verify** these against the original game:
  - Muster takes cards from the deck only (not the hand)
  - Mustered cards are placed without triggering their own abilities
  - A revived agile unit goes to its printed row (no choice)
  - Unit scorch applies to the played card's own row, and only the opponent's own units count towards the total of 10

## Factions and leaders
- [ ] Northern Realms: draw a card after winning a round
- [ ] Nilfgaard: wins ties
- [ ] Scoia'tael: chooses who goes first
- [ ] Monsters: one random unit stays on the board after each round
- [ ] Skellige: two random units from the graveyard come back at the start of round 3
- [ ] Leader abilities (one use per match)

## Deck building
- [ ] Minimum 22 unit cards
- [ ] Maximum 10 special cards
- [ ] All cards belong to the chosen faction or are neutral
