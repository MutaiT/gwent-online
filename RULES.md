# Rules spec

The game follows the card game as played in The Witcher 3: Wild Hunt. This file
is the engine's checklist. **Written from memory of the original rules: check it
against the game and correct anything that differs before relying on it.**

Status: `[x]` implemented and tested, `[ ]` not yet.

## Match flow
- [ ] Two players, each with a deck, a hand of 10 cards, and a leader card
- [ ] Coin toss decides who plays first in round 1
- [ ] Best of three rounds; each player has two lives and loses one by losing a round
- [ ] A drawn round costs both players a life
- [ ] On their turn a player plays one card, or passes; once passed, a player takes no more turns in that round
- [ ] The round ends when both players have passed; the higher total wins
- [ ] Cards on the board go to the graveyard at the end of each round
- [ ] Hands carry over between rounds (no redraw except through abilities)

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
- [x] Commander's Horn doubles the units in one row (does not stack)
- [ ] Decoy: swap with a unit on your board, returning it to your hand
- [ ] Scorch: destroy the strongest non-hero unit(s) on the board

## Unit abilities
- [x] Tight bond: same-group units in a row multiply each other
- [x] Morale boost: +1 to every other unit in the row
- [x] Horn (unit): doubles the other units in its row
- [ ] Spy: placed on the opponent's side; its owner draws 2 cards
- [ ] Medic: return a non-hero unit from your graveyard to play
- [ ] Muster: when played, bring out all cards of the same muster group from deck and hand
- [ ] Agile: may be placed in close combat or ranged
- [ ] Scorch (unit): as the special card, restricted to a row

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
