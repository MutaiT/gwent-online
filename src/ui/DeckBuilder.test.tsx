// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadSavedDeck } from "../data/deckBuilder";
import { App } from "./App";

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

async function openBuilder(faction = /Northern Realms/) {
  const user = userEvent.setup();
  render(<App aiDelayMs={10_000_000} />);
  await user.click(screen.getByRole("radio", { name: faction }));
  await user.click(screen.getByRole("button", { name: "Edit deck" }));
  return user;
}

/** The first whole number in a stat, so "8/10" reads as 8 and "34 / min 22" as 34. */
const num = (testId: string): number => Number(/\d+/.exec(screen.getByTestId(testId).textContent!)![0]);
const collection = () => screen.getByRole("region", { name: "Card collection" });
const inDeck = () => screen.getByRole("region", { name: "Cards in deck" });
const collectCount = (name: string): number => Number(within(collection()).getByTestId(`collect-count-${name}`).textContent!.replace("×", ""));
const deckCount = (name: string): number => Number(within(inDeck()).getByTestId(`deck-count-${name}`).textContent!.replace("×", ""));

describe("opening the deck builder", () => {
  it("is reached from the menu with Edit deck, and shows the collection, the deck and the details", async () => {
    await openBuilder();
    expect(screen.getByRole("main", { name: "Deck builder" })).toBeTruthy();
    expect(screen.queryByRole("main", { name: "Choose your faction" })).toBeNull();
    expect(collection()).toBeTruthy();
    expect(inDeck()).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Deck details" })).getByText("Northern Realms")).toBeTruthy();
  });

  it("starts with the starter deck, which is legal", async () => {
    await openBuilder();
    expect(screen.getByTestId("builder-status").textContent).toBe("Deck is ready.");
    expect(num("stat-units")).toBeGreaterThanOrEqual(22);
    expect(num("stat-specials")).toBeLessThanOrEqual(10);
    expect(screen.getByRole("button", { name: "Start game" }).hasAttribute("disabled")).toBe(false);
  });

  it("shows only the cards that faction may use", async () => {
    await openBuilder(/Monsters/);
    expect(within(collection()).queryByTestId("collect-Vernon Roche")).toBeNull();
    expect(within(collection()).getByTestId("collect-Imlerith")).toBeTruthy();
    expect(within(collection()).getByTestId("collect-Geralt of Rivia")).toBeTruthy();
    expect(within(collection()).queryByTestId("collect-Mardroeme")).toBeNull();
  });

  it("Back returns to the menu with the same faction chosen", async () => {
    const user = await openBuilder(/Skellige/);
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("main", { name: "Choose your faction" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Skellige/ }).getAttribute("aria-checked")).toBe("true");
  });
});

describe("adding and removing cards", () => {
  it("clicking a card in the collection adds it to the deck and counts it", async () => {
    const user = await openBuilder();
    const before = { cards: num("stat-cards"), units: num("stat-units"), left: collectCount("Dandelion") };
    expect(before.left).toBe(0);
    // Find a unit card that is not already all in the starter deck.
    const tile = [...collection().querySelectorAll<HTMLElement>("[data-testid^=collect-]")].find(
      (e) => e.tagName === "BUTTON" && !/Biting Frost|Fog|Rain|Clear|Storm|Scorch|Decoy|Horn/.test(e.dataset.testid!),
    )!;
    const name = tile.dataset.testid!.replace("collect-", "");
    const free = collectCount(name);
    expect(free).toBeGreaterThan(0);
    const had = within(inDeck()).queryByTestId(`deck-count-${name}`) ? deckCount(name) : 0;
    await user.click(within(collection()).getByTestId(`collect-${name}`));
    expect(collectCount(name)).toBe(free - 1);
    expect(deckCount(name)).toBe(had + 1);
    expect(num("stat-cards")).toBe(before.cards + 1);
    expect(num("stat-units")).toBe(before.units + 1);
  });

  it("clicking a card in the deck takes it out and puts it back in the collection", async () => {
    const user = await openBuilder();
    const cards = num("stat-cards");
    const left = collectCount("Dandelion");
    await user.click(within(inDeck()).getByTestId("deck-Dandelion"));
    expect(within(inDeck()).queryByTestId("deck-Dandelion")).toBeNull();
    expect(collectCount("Dandelion")).toBe(left + 1);
    expect(num("stat-cards")).toBe(cards - 1);
  });

  it("you cannot take more copies than the collection has: the last copy greys the card out", async () => {
    const user = await openBuilder();
    const name = "Blue Stripes Commando";
    const total = collectCount(name) + (within(inDeck()).queryByTestId(`deck-count-${name}`) ? deckCount(name) : 0);
    expect(total).toBe(3);
    while (collectCount(name) > 0) await user.click(within(collection()).getByTestId(`collect-${name}`));
    expect(deckCount(name)).toBe(3);
    const tile = within(collection()).getByTestId(`collect-${name}`);
    expect(tile.tagName).not.toBe("BUTTON");
    expect(collectCount(name)).toBe(0);
  });

  it("every copy taken out comes back one at a time", async () => {
    const user = await openBuilder();
    const name = "Ballista";
    const inD = deckCount(name);
    for (let i = 0; i < inD; i++) await user.click(within(inDeck()).getByTestId(`deck-${name}`));
    expect(within(inDeck()).queryByTestId(`deck-${name}`)).toBeNull();
    expect(collectCount(name)).toBe(2);
  });

  it("the stats follow strength, heroes and specials", async () => {
    const user = await openBuilder();
    const strength = num("stat-strength");
    const heroes = num("stat-heroes");
    await user.click(within(inDeck()).getByTestId("deck-Geralt of Rivia"));
    expect(num("stat-strength")).toBe(strength - 15);
    expect(num("stat-heroes")).toBe(heroes - 1);
    const specials = num("stat-specials");
    await user.click(within(collection()).getByTestId("collect-Biting Frost"));
    expect(num("stat-specials")).toBe(specials + 1);
    expect(num("stat-strength")).toBe(strength - 15);
  });
});

describe("the deck-building rules", () => {
  it("too few units: says so, marks the count, and blocks Start game", async () => {
    const user = await openBuilder();
    const need = num("stat-units") - 21;
    const names = [...inDeck().querySelectorAll<HTMLElement>("[data-testid^=deck-count-]")]
      .map((e) => e.dataset.testid!.replace("deck-count-", ""))
      .filter((n) => !["Scorch", "Decoy", "Commander's Horn", "Biting Frost", "Impenetrable Fog", "Torrential Rain", "Clear Weather"].includes(n));
    let removed = 0;
    for (const name of names) {
      while (removed < need && within(inDeck()).queryByTestId(`deck-${name}`)) {
        await user.click(within(inDeck()).getByTestId(`deck-${name}`));
        removed += 1;
      }
    }
    expect(num("stat-units")).toBe(21);
    expect(screen.getByTestId("builder-status").textContent).toBe("Needs at least 22 unit cards, has 21");
    expect(screen.getByTestId("stat-units").className).toBe("bad");
    const start = screen.getByRole("button", { name: "Start game" });
    expect(start.hasAttribute("disabled")).toBe(true);
    expect(start.getAttribute("title")).toBe("Needs at least 22 unit cards, has 21");
  });

  it("too many special cards: says so and blocks Start game", async () => {
    const user = await openBuilder();
    const specials = ["Biting Frost", "Impenetrable Fog", "Torrential Rain", "Clear Weather", "Skellige Storm", "Scorch", "Decoy", "Commander's Horn"];
    for (const name of specials) {
      for (let i = 0; i < 3 && num("stat-specials") <= 10; i++) {
        const tile = within(collection()).queryByTestId(`collect-${name}`);
        if (tile && tile.tagName === "BUTTON") await user.click(tile);
      }
    }
    expect(num("stat-specials")).toBeGreaterThan(10);
    expect(screen.getByTestId("builder-status").textContent).toMatch(/Allows at most 10 special cards/);
    expect(screen.getByTestId("stat-specials").className).toBe("bad");
    expect(screen.getByRole("button", { name: "Start game" }).hasAttribute("disabled")).toBe(true);
  });

  it("fixing the deck makes it ready again", async () => {
    const user = await openBuilder();
    await user.click(within(inDeck()).getByTestId("deck-Geralt of Rivia"));
    const specialsBefore = num("stat-specials");
    expect(specialsBefore).toBeGreaterThan(0);
    await user.click(within(collection()).getByTestId("collect-Geralt of Rivia"));
    expect(screen.getByTestId("builder-status").textContent).toBe("Deck is ready.");
  });

  it("Reset to starter deck restores the original cards", async () => {
    const user = await openBuilder();
    const cards = num("stat-cards");
    await user.click(within(inDeck()).getByTestId("deck-Geralt of Rivia"));
    await user.click(within(inDeck()).getByTestId("deck-Dandelion"));
    expect(num("stat-cards")).toBe(cards - 2);
    await user.click(screen.getByRole("button", { name: "Reset to starter deck" }));
    expect(num("stat-cards")).toBe(cards);
    expect(within(inDeck()).getByTestId("deck-Geralt of Rivia")).toBeTruthy();
  });
});

describe("the leader", () => {
  it("clicking the leader picture moves on to the faction's next leader", async () => {
    const user = await openBuilder();
    const centre = screen.getByRole("region", { name: "Deck details" });
    expect(within(centre).getByText("Foltest: King of Temeria")).toBeTruthy();
    await user.click(within(centre).getByRole("button", { name: /Leader: Foltest: King of Temeria/ }));
    expect(within(centre).getByText("Foltest: Lord Commander of the North")).toBeTruthy();
  });

  it("the leader you pick carries back to the menu", async () => {
    const user = await openBuilder();
    await user.click(screen.getByRole("button", { name: /^Leader: Foltest: King of Temeria/ }));
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("radio", { name: /Lord Commander of the North/ }).getAttribute("aria-checked")).toBe("true");
  });
});

describe("saving", () => {
  it("a legal deck is saved as you build it, and shown on the menu", async () => {
    const user = await openBuilder();
    expect(loadSavedDeck("northernRealms")).toBeNull();
    await user.click(within(inDeck()).getByTestId("deck-Dandelion"));
    expect(loadSavedDeck("northernRealms")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByTestId("deck-note").textContent).toMatch(/your saved deck \(\d+ cards\)/);
  });

  it("a deck that breaks the rules is not saved: the last legal deck stays saved instead", async () => {
    const user = await openBuilder();
    const plain = () =>
      [...inDeck().querySelectorAll<HTMLElement>("[data-testid^=deck-count-]")]
        .map((e) => e.dataset.testid!.replace("deck-count-", ""))
        .filter((n) => !/Biting Frost|Fog|Rain|Clear|Storm|Scorch|Decoy|Horn/.test(n));
    while (num("stat-units") > 22) await user.click(within(inDeck()).getByTestId(`deck-${plain()[0]}`));
    expect(screen.getByTestId("builder-status").textContent).toBe("Deck is ready.");
    const legalCards = num("stat-cards");
    expect(loadSavedDeck("northernRealms")).toHaveLength(legalCards);

    await user.click(within(inDeck()).getByTestId(`deck-${plain()[0]}`));
    expect(num("stat-units")).toBe(21);
    expect(screen.getByRole("button", { name: "Start game" }).hasAttribute("disabled")).toBe(true);
    expect(loadSavedDeck("northernRealms")).toHaveLength(legalCards);
  });

  it("the saved deck comes back when you reopen the builder", async () => {
    const user = await openBuilder();
    await user.click(within(inDeck()).getByTestId("deck-Dandelion"));
    const cards = num("stat-cards");
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: "Edit deck" }));
    expect(num("stat-cards")).toBe(cards);
    expect(within(inDeck()).queryByTestId("deck-Dandelion")).toBeNull();
  });

  it("Use the starter deck on the menu forgets the saved one", async () => {
    const user = await openBuilder();
    await user.click(within(inDeck()).getByTestId("deck-Dandelion"));
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: "Use the starter deck" }));
    expect(screen.getByTestId("deck-note").textContent).toBe("Deck: the starter deck");
    expect(screen.queryByRole("button", { name: "Use the starter deck" })).toBeNull();
    expect(loadSavedDeck("northernRealms")).toBeNull();
  });

  it("each faction keeps its own saved deck", async () => {
    const user = await openBuilder();
    await user.click(within(inDeck()).getByTestId("deck-Dandelion"));
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("radio", { name: /Monsters/ }));
    expect(screen.getByTestId("deck-note").textContent).toBe("Deck: the starter deck");
    await user.click(screen.getByRole("radio", { name: /Northern Realms/ }));
    expect(screen.getByTestId("deck-note").textContent).toMatch(/your saved deck/);
  });
});

describe("playing with your deck", () => {
  it("Start game in the builder begins a match with exactly your cards", async () => {
    const user = await openBuilder();
    // Take out three units so the deck is recognisably different from the starter.
    const cards = num("stat-cards");
    for (const name of ["Dandelion", "Vesemir", "Thaler"]) {
      const tile = within(inDeck()).queryByTestId(`deck-${name}`);
      if (tile) await user.click(tile);
    }
    const expected = num("stat-cards");
    expect(expected).toBeLessThan(cards);
    await user.click(screen.getByRole("button", { name: "Start game" }));
    expect(screen.getByRole("main", { name: "Game board" })).toBeTruthy();
    const dialog = screen.getByRole("dialog", { name: "Redraw" });
    expect(within(dialog).getAllByTestId(/^redraw-/)).toHaveLength(10);
    // 10 in hand, the rest in the deck pile.
    expect(screen.getByLabelText(new RegExp(`Your deck \\(${expected - 10}\\)`))).toBeTruthy();
  });

  it("Start game on the menu uses your saved deck", async () => {
    const user = await openBuilder();
    await user.click(within(inDeck()).getByTestId("deck-Dandelion"));
    const expected = num("stat-cards");
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: "Start game" }));
    expect(screen.getByLabelText(new RegExp(`Your deck \\(${expected - 10}\\)`))).toBeTruthy();
  });
});

describe("the description bar", () => {
  it("shows a card's name and what it does while you hover it, and hides afterwards", async () => {
    const user = await openBuilder();
    const tile = within(collection()).getByTestId("collect-Cirilla Fiona Elen Riannon");
    await user.hover(tile);
    const bar = screen.getByRole("complementary", { name: "Card description" });
    expect(within(bar).getByText("Cirilla Fiona Elen Riannon")).toBeTruthy();
    expect(within(bar).getByText(/strength 15/)).toBeTruthy();
    expect(within(bar).getByText(/Hero: not affected by weather/)).toBeTruthy();
    await user.unhover(tile);
    expect(screen.queryByRole("complementary", { name: "Card description" })).toBeNull();
  });
});
