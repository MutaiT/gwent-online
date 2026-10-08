// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { Ability, Card, RowName, SpecialCard, UnitCard } from "../engine/types";
import { App } from "./App";
import { AI, HUMAN, initialState, type UIState } from "./controller";

afterEach(cleanup);

function unit(id: string, power: number, row: RowName = "close", abilities: Ability[] = []): UnitCard {
  return { kind: "unit", id, name: `Unit ${id}`, basePower: power, row, isHero: false, abilities };
}
const horn: SpecialCard = { kind: "special", id: "horn", name: "Test Horn", effect: "horn" };
const decoy: SpecialCard = { kind: "special", id: "decoy", name: "Test Decoy", effect: "decoy" };

/** A human-turn state whose hand is exactly `hand`, with the given graveyard and board. */
function state(hand: Card[], extra: { graveyard?: Card[]; board?: UnitCard[] } = {}): UIState {
  const s = initialState(1);
  s.game.current = HUMAN;
  s.game.roundStarter = HUMAN;
  s.game.players[HUMAN].hand = hand;
  s.game.players[HUMAN].graveyard = extra.graveyard ?? [];
  s.game.players[HUMAN].board.close.units = extra.board ?? [];
  return s;
}

const hand = (id: string) => screen.getByTestId(`hand-${id}`);
const row = (side: 0 | 1, name: RowName) => screen.getByTestId(`row-${side}-${name}`);

describe("the faction menu", () => {
  it("opens first when no game is given, with all five factions and Northern Realms chosen", () => {
    render(<App aiDelayMs={10_000_000} />);
    expect(screen.getByRole("main", { name: "Choose your faction" })).toBeTruthy();
    const factions = within(screen.getByRole("radiogroup", { name: "Faction" })).getAllByRole("radio");
    expect(factions.map((f) => f.textContent!.replace(/\s+/g, " ").slice(0, 16))).toEqual([
      expect.stringContaining("Northern Realms"),
      expect.stringContaining("Nilfgaardian"),
      expect.stringContaining("Scoia'tael"),
      expect.stringContaining("Monsters"),
      expect.stringContaining("Skellige"),
    ]);
    expect(factions[0]!.getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByTestId("status")).toBeNull();
  });

  it("each faction explains its ability", () => {
    render(<App aiDelayMs={10_000_000} />);
    expect(screen.getByText(/Wins any round that ends in a draw/)).toBeTruthy();
    expect(screen.getByText(/Keeps a random unit on the board after each round/)).toBeTruthy();
  });

  it("choosing a faction shows its usable leaders, and the ones that are not playable yet", async () => {
    const user = userEvent.setup();
    render(<App aiDelayMs={10_000_000} />);
    await user.click(screen.getByRole("radio", { name: /Nilfgaardian Empire/ }));
    const leaders = screen.getByRole("radiogroup", { name: "Leader" });
    expect(within(leaders).getByRole("radio", { name: /His Imperial Majesty/ }).getAttribute("aria-checked")).toBe("true");
    expect(within(leaders).queryByRole("radio", { name: /The White Flame/ })).toBeNull();
    expect(within(leaders).getByText("Emhyr var Emreis: The White Flame")).toBeTruthy();
    expect(within(leaders).getAllByText("coming soon").length).toBeGreaterThan(0);
  });

  it("Start game begins a match as the chosen faction and leader, against a different faction", async () => {
    const user = userEvent.setup();
    render(<App aiDelayMs={10_000_000} />);
    await user.click(screen.getByRole("radio", { name: /Scoia'tael/ }));
    await user.click(screen.getByRole("radio", { name: /Francesca Findabair: The Beautiful/ }));
    await user.click(screen.getByRole("button", { name: "Start game" }));
    expect(screen.getByRole("main", { name: "Game board" })).toBeTruthy();
    expect(screen.queryByRole("main", { name: "Choose your faction" })).toBeNull();
    expect(within(screen.getByTestId("score-you")).getByText("Scoia'tael")).toBeTruthy();
    const opponent = within(screen.getByTestId("score-opponent")).getByText(/Northern Realms|Nilfgaardian Empire|Monsters|Skellige/);
    expect(opponent).toBeTruthy();
    expect(screen.getByRole("button", { name: /Leader: Francesca Findabair: The Beautiful/ })).toBeTruthy();
  });

  it("New game returns to the menu", async () => {
    const user = userEvent.setup();
    render(<App initial={state([unit("a", 4)])} aiDelayMs={10_000_000} />);
    await user.click(screen.getByRole("button", { name: "New game" }));
    expect(screen.getByRole("main", { name: "Choose your faction" })).toBeTruthy();
  });

  it("a setup skips the menu", () => {
    render(<App setup={{ player: "nilfgaard", opponent: "skellige" }} aiDelayMs={10_000_000} />);
    expect(screen.queryByRole("main", { name: "Choose your faction" })).toBeNull();
    expect(within(screen.getByTestId("score-you")).getByText("Nilfgaardian Empire")).toBeTruthy();
    expect(within(screen.getByTestId("score-opponent")).getByText("Skellige")).toBeTruthy();
  });
});

describe("official card faces", () => {
  it("show the printed face as an image, with no extra badge while the strength is unchanged", () => {
    const face: UnitCard = { ...unit("f", 5), art: "/cards/x.webp", officialFace: true };
    render(<App initial={state([face])} aiDelayMs={10_000_000} />);
    expect(hand("f").querySelector("img.face-img")?.getAttribute("src")).toBe("/cards/x.webp");
    expect(hand("f").querySelector(".power")).toBeNull();
    expect(hand("f").querySelector(".badges")).toBeNull();
  });

  it("add a strength badge on the board only when weather or an ability changed it", () => {
    const face: UnitCard = { ...unit("f", 5), art: "/cards/x.webp", officialFace: true };
    const s = state([unit("a", 3)], { board: [face, { ...face, id: "g" }] });
    s.game.players[HUMAN].board.close.weather = true;
    render(<App initial={s} aiDelayMs={10_000_000} />);
    expect(screen.getByTestId("board-f").querySelector(".power")?.textContent).toBe("1");
    expect(screen.getByTestId("board-f").querySelector(".power.reduced")).toBeTruthy();
  });

  it("the preview shows the full face and the card's name", async () => {
    const user = userEvent.setup();
    const face: UnitCard = { ...unit("f", 5), name: "Test Hero", art: "/cards/x.webp", officialFace: true };
    render(<App initial={state([face])} aiDelayMs={10_000_000} />);
    await user.hover(hand("f"));
    const preview = screen.getByTestId("preview");
    expect(within(preview).getByText("Test Hero")).toBeTruthy();
    expect(preview.querySelector(".preview-face img")?.getAttribute("src")).toBe("/cards/x.webp");
  });
});

describe("the board", () => {
  it("shows ten cards in hand, six rows, and starts on your turn", () => {
    render(<App seed={1} initial={state(Array.from({ length: 10 }, (_, i) => unit(`h${i}`, 3)))} aiDelayMs={0} />);
    expect(screen.getAllByTestId(/^hand-/)).toHaveLength(10);
    for (const side of [0, 1] as const) for (const r of ["close", "ranged", "siege"] as const) expect(row(side, r)).toBeTruthy();
    expect(screen.getByTestId("status").textContent).toBe("Your turn");
    expect(screen.getByText("Round 1 of 3")).toBeTruthy();
  });

  it("cards cannot be played while it is the opponent's turn", () => {
    const s = state([unit("a", 3)]);
    s.game.current = AI;
    render(<App initial={s} aiDelayMs={10_000_000} />);
    expect(hand("a").tagName).not.toBe("BUTTON");
    expect(screen.getByTestId("status").textContent).toMatch(/thinking/);
  });
});

describe("playing units", () => {
  it("selecting a card offers Play, and playing puts it on its row", async () => {
    const user = userEvent.setup();
    render(<App initial={state([unit("a", 6, "ranged"), unit("b", 3)])} aiDelayMs={10_000_000} />);
    await user.click(hand("a"));
    await user.click(screen.getByRole("button", { name: "Play Unit a" }));
    expect(within(row(0, "ranged")).getByTestId("board-a")).toBeTruthy();
    expect(screen.queryByTestId("hand-a")).toBeNull();
    expect(screen.getByTestId("score-you").textContent).toContain("6");
    expect(screen.getByText("You played Unit a")).toBeTruthy();
  });

  it("clicking the selected card a second time plays it", async () => {
    const user = userEvent.setup();
    render(<App initial={state([unit("a", 4), unit("b", 3)])} aiDelayMs={10_000_000} />);
    await user.click(hand("a"));
    await user.click(hand("a"));
    expect(within(row(0, "close")).getByTestId("board-a")).toBeTruthy();
  });

  it("Cancel clears the selection", async () => {
    const user = userEvent.setup();
    render(<App initial={state([unit("a", 4)])} aiDelayMs={10_000_000} />);
    await user.click(hand("a"));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByTestId("prompt")).toBeNull();
    expect(hand("a").getAttribute("aria-pressed")).toBe("false");
  });

  it("after you play, the opponent answers", async () => {
    const user = userEvent.setup();
    render(<App initial={state([unit("a", 4), unit("b", 3)])} aiDelayMs={0} />);
    await user.click(hand("a"));
    await user.click(screen.getByRole("button", { name: "Play Unit a" }));
    await waitFor(() => expect(screen.getAllByText(/^Opponent /).length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getByTestId("status").textContent).not.toMatch(/thinking/));
  });
});

describe("cards that need a choice", () => {
  it("an agile unit lets you pick the row", async () => {
    const user = userEvent.setup();
    render(<App initial={state([unit("ag", 5, "close", ["agile"])])} aiDelayMs={10_000_000} />);
    await user.click(hand("ag"));
    expect(screen.getByTestId("prompt").textContent).toContain("Choose a row");
    expect(screen.queryByRole("button", { name: /^Play Unit/ })).toBeNull();
    expect(within(row(0, "siege")).queryByRole("button", { name: /Play here/ })).toBeNull();
    await user.click(within(row(0, "ranged")).getByRole("button", { name: /Play here/ }));
    expect(within(row(0, "ranged")).getByTestId("board-ag")).toBeTruthy();
  });

  it("a horn card goes on the row you click and doubles it", async () => {
    const user = userEvent.setup();
    const s = state([horn]);
    s.game.players[HUMAN].board.siege.units = [unit("c", 5, "siege")];
    render(<App initial={s} aiDelayMs={10_000_000} />);
    expect(row(0, "siege").textContent).toContain("5");
    await user.click(hand("horn"));
    await user.click(within(row(0, "siege")).getByRole("button", { name: /Play here/ }));
    expect(within(row(0, "siege")).getByText("Horn")).toBeTruthy();
    expect(within(row(0, "siege")).getByLabelText("Siege total").textContent).toBe("10");
    expect(screen.queryByTestId("hand-horn")).toBeNull();
  });

  it("a decoy takes back the unit you click", async () => {
    const user = userEvent.setup();
    render(<App initial={state([decoy], { board: [unit("mine", 7)] })} aiDelayMs={10_000_000} />);
    await user.click(hand("decoy"));
    expect(screen.getByTestId("prompt").textContent).toContain("take back");
    await user.click(screen.getByTestId("board-mine"));
    expect(screen.queryByTestId("board-mine")).toBeNull();
    expect(hand("mine")).toBeTruthy();
  });
});

describe("medic", () => {
  it("asks which unit to bring back, then puts it on the board", async () => {
    const user = userEvent.setup();
    render(
      <App
        initial={state([unit("med", 2, "close", ["medic"])], { graveyard: [unit("dead", 6), unit("dead2", 3)] })}
        aiDelayMs={10_000_000}
      />,
    );
    await user.click(hand("med"));
    await user.click(screen.getByRole("button", { name: "Play Unit med" }));
    const dialog = screen.getByRole("dialog", { name: "Bring a unit back" });
    expect(within(dialog).getAllByRole("button")).toHaveLength(2);
    await user.click(within(dialog).getByTestId("pick-dead"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(row(0, "close")).getByTestId("board-dead")).toBeTruthy();
    expect(screen.getByText("You revived Unit dead")).toBeTruthy();
  });
});

describe("sidebar", () => {
  it("passing hands the turn over, and the round ends when both have passed", async () => {
    const user = userEvent.setup();
    render(<App initial={state([unit("a", 4)])} aiDelayMs={0} />);
    const sidebar = screen.getByRole("complementary", { name: "Match information" });
    await user.click(within(sidebar).getByRole("button", { name: "Pass" }));
    expect(screen.getByText("You passed")).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/^Round 1: /)).toBeTruthy());
  });

  it("the leader button uses the leader once", async () => {
    const user = userEvent.setup();
    render(<App initial={state([unit("a", 4)])} aiDelayMs={10_000_000} />);
    const leader = screen.getByRole("button", { name: /Leader: Foltest: The Siegemaster \(Ready\)/ });
    await user.click(leader);
    expect(screen.getByText("You used Foltest: The Siegemaster")).toBeTruthy();
    expect(within(row(0, "siege")).getByText("Horn")).toBeTruthy();
    expect(screen.getByText(/Foltest: The Siegemaster \(Used\)/)).toBeTruthy();
  });

  it("the graveyard viewer lists the cards and closes", async () => {
    const user = userEvent.setup();
    render(<App initial={state([unit("a", 4)], { graveyard: [unit("old", 5)] })} aiDelayMs={10_000_000} />);
    await user.click(screen.getByRole("button", { name: "Your graveyard (1)" }));
    const dialog = screen.getByRole("dialog", { name: "Your graveyard" });
    expect(within(dialog).getByTestId("pick-old")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("the table", () => {
  it("shows a Passed tag once a player has passed", () => {
    const s = state([unit("a", 4)]);
    s.game.players[AI].passed = true;
    render(<App initial={s} aiDelayMs={10_000_000} />);
    const panel = screen.getByTestId("score-opponent");
    expect(within(panel).getByText("Passed")).toBeTruthy();
    expect(within(screen.getByTestId("score-you")).queryByText("Passed")).toBeNull();
  });

  it("names each side's faction and counts cards in hand", () => {
    render(<App initial={state([unit("a", 4), unit("b", 3)])} aiDelayMs={10_000_000} />);
    expect(within(screen.getByTestId("score-you")).getByText("Northern Realms")).toBeTruthy();
    expect(within(screen.getByTestId("score-opponent")).getByText("Monsters")).toBeTruthy();
    expect(within(screen.getByTestId("score-you")).getByLabelText("2 cards in hand")).toBeTruthy();
  });

  it("highlights whoever has the higher total", () => {
    const s = state([unit("a", 4)], { board: [unit("on", 9)] });
    render(<App initial={s} aiDelayMs={10_000_000} />);
    expect(within(screen.getByTestId("score-you")).getByLabelText("You total").className).toContain("leading");
    expect(within(screen.getByTestId("score-opponent")).getByLabelText("Opponent total").className).not.toContain("leading");
  });

  it("the weather slot lists the rows under weather", () => {
    const s = state([unit("a", 4)]);
    s.game.players[AI].board.ranged.weather = true;
    s.game.players[HUMAN].board.ranged.weather = true;
    render(<App initial={s} aiDelayMs={10_000_000} />);
    expect(within(screen.getByLabelText("Weather")).getByText("Fog")).toBeTruthy();
    expect(within(screen.getByLabelText("Weather")).queryByText("Frost")).toBeNull();
    expect(within(row(0, "ranged")).getByText("Weather")).toBeTruthy();
  });

  it("the weather slot says clear when there is none", () => {
    render(<App initial={state([unit("a", 4)])} aiDelayMs={10_000_000} />);
    expect(within(screen.getByLabelText("Weather")).getByText("clear")).toBeTruthy();
  });

  it("shows a card's artwork when it has some, and placeholder art otherwise", () => {
    const withArt: UnitCard = { ...unit("pic", 5), art: "/art/pic.png" };
    const { container } = render(<App initial={state([withArt, unit("plain", 3)])} aiDelayMs={10_000_000} />);
    expect(hand("pic").querySelector("img.art")?.getAttribute("src")).toBe("/art/pic.png");
    expect(hand("plain").querySelector("img.art")).toBeNull();
    expect(hand("plain").querySelector(".art.placeholder")).toBeTruthy();
    expect(container.querySelectorAll("img.art")).toHaveLength(1);
  });

  it("each row has a score badge and a horn slot, and the horn slot lights up with a horn", () => {
    const s = state([unit("a", 4)]);
    s.game.players[HUMAN].board.ranged.hornCard = true;
    render(<App initial={s} aiDelayMs={10_000_000} />);
    expect(within(row(0, "ranged")).getByLabelText("Ranged total")).toBeTruthy();
    expect(within(row(0, "ranged")).getByText("Horn")).toBeTruthy();
    expect(within(row(0, "close")).queryByText("Horn")).toBeNull();
  });
});

describe("the card preview", () => {
  it("shows a large card with its abilities while you hover a card, and hides it afterwards", async () => {
    const user = userEvent.setup();
    render(<App initial={state([unit("sp", 5, "ranged", ["spy", "agile"]), unit("b", 3)])} aiDelayMs={10_000_000} />);
    expect(screen.queryByTestId("preview")).toBeNull();
    await user.hover(hand("sp"));
    const preview = screen.getByTestId("preview");
    expect(within(preview).getByText("Unit sp")).toBeTruthy();
    expect(within(preview).getByText(/Ranged · base strength 5/)).toBeTruthy();
    expect(within(preview).getByText(/Spy: played on the opponent's side/)).toBeTruthy();
    expect(within(preview).getByText(/Agile: can be played to close combat or ranged/)).toBeTruthy();
    await user.unhover(hand("sp"));
    expect(screen.queryByTestId("preview")).toBeNull();
  });

  it("also appears when a card is focused with the keyboard", () => {
    render(<App initial={state([unit("a", 4)])} aiDelayMs={10_000_000} />);
    act(() => hand("a").focus());
    expect(screen.getByTestId("preview")).toBeTruthy();
    act(() => hand("a").blur());
    expect(screen.queryByTestId("preview")).toBeNull();
  });

  it("explains hero immunity and special cards", async () => {
    const user = userEvent.setup();
    const hero: UnitCard = { ...unit("h", 10), isHero: true };
    render(<App initial={state([hero, horn])} aiDelayMs={10_000_000} />);
    await user.hover(hand("h"));
    expect(within(screen.getByTestId("preview")).getByText(/not affected by weather, horn, bond/)).toBeTruthy();
    await user.unhover(hand("h"));
    await user.hover(hand("horn"));
    expect(within(screen.getByTestId("preview")).getByText(/Commander's horn: doubles the strength/)).toBeTruthy();
  });

  it("shows a board card's current strength when weather has changed it", async () => {
    const user = userEvent.setup();
    const s = state([unit("a", 4)], { board: [unit("on", 9)] });
    s.game.players[HUMAN].board.close.weather = true;
    render(<App initial={s} aiDelayMs={10_000_000} />);
    await user.hover(screen.getByTestId("board-on"));
    const preview = screen.getByTestId("preview");
    expect(within(preview).getByText(/base strength 9/)).toBeTruthy();
    expect(within(preview).getByText("Now 1")).toBeTruthy();
  });
});

describe("the end of a game", () => {
  function finished(winner: 0 | 1 | "draw"): UIState {
    const s = state([unit("a", 4)]);
    s.game.status = "finished";
    s.game.winner = winner;
    s.game.rounds = [{ round: 1, scores: [12, 7], winner: 0 }];
    return s;
  }

  it.each([
    [0, "You won!"],
    [1, "You lost"],
    ["draw", "A draw"],
  ] as const)("shows the result when the winner is %s", (winner, title) => {
    render(<App initial={finished(winner)} aiDelayMs={10_000_000} />);
    const dialog = screen.getByRole("dialog", { name: title });
    expect(within(dialog).getByText("Round 1: you 12, opponent 7")).toBeTruthy();
  });

  it("Play again starts a fresh game", async () => {
    const user = userEvent.setup();
    render(<App initial={finished(0)} aiDelayMs={10_000_000} />);
    await user.click(screen.getByRole("button", { name: "Play again" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Round 1 of 3")).toBeTruthy();
    expect(screen.getAllByTestId(/^hand-/)).toHaveLength(10);
  });
});
