import { describe, expect, it } from "vitest";
import { boardPower, rowPower, unitPower } from "./scoring";
import { emptyBoard, emptyRow, type Ability, type RowState, type UnitCard } from "./types";

let n = 0;
function unit(
  basePower: number,
  opts: { hero?: boolean; abilities?: Ability[]; bond?: string; name?: string } = {},
): UnitCard {
  n += 1;
  return {
    id: `u${n}`,
    name: opts.name ?? `Unit ${n}`,
    basePower,
    row: "close",
    isHero: opts.hero ?? false,
    abilities: opts.abilities ?? [],
    bondGroup: opts.bond,
  };
}

function row(units: UnitCard[], extra: Partial<RowState> = {}): RowState {
  return { ...emptyRow(), units, ...extra };
}

describe("base scoring", () => {
  it("an empty row scores 0", () => {
    expect(rowPower(emptyRow())).toBe(0);
  });

  it("sums printed strengths", () => {
    expect(rowPower(row([unit(4), unit(6), unit(2)]))).toBe(12);
  });

  it("adds all three rows together", () => {
    const board = emptyBoard();
    board.close = row([unit(5)]);
    board.ranged = row([unit(3), unit(4)]);
    board.siege = row([unit(6)]);
    expect(boardPower(board)).toBe(18);
  });
});

describe("weather", () => {
  it("sets non-hero units to 1", () => {
    expect(rowPower(row([unit(5), unit(8)], { weather: true }))).toBe(2);
  });

  it("does not affect heroes", () => {
    expect(rowPower(row([unit(10, { hero: true }), unit(5)], { weather: true }))).toBe(11);
  });
});

describe("tight bond", () => {
  it("multiplies each bonded unit by the number of bonded units", () => {
    const a = unit(4, { abilities: ["tightBond"], bond: "g" });
    const b = unit(4, { abilities: ["tightBond"], bond: "g" });
    expect(rowPower(row([a, b]))).toBe(16); // (4*2) + (4*2)
  });

  it("only bonds units in the same group", () => {
    const a = unit(4, { abilities: ["tightBond"], bond: "g1" });
    const b = unit(4, { abilities: ["tightBond"], bond: "g2" });
    expect(rowPower(row([a, b]))).toBe(8);
  });

  it("applies on top of weather", () => {
    const a = unit(4, { abilities: ["tightBond"], bond: "g" });
    const b = unit(4, { abilities: ["tightBond"], bond: "g" });
    const c = unit(4, { abilities: ["tightBond"], bond: "g" });
    expect(rowPower(row([a, b, c], { weather: true }))).toBe(9); // (1*3) x 3
  });
});

describe("morale boost", () => {
  it("adds 1 to every other unit in the row, not itself", () => {
    const booster = unit(2, { abilities: ["moraleBoost"] });
    const other = unit(5);
    expect(unitPower(row([booster, other]), booster)).toBe(2);
    expect(unitPower(row([booster, other]), other)).toBe(6);
  });

  it("stacks with several boosters", () => {
    const b1 = unit(1, { abilities: ["moraleBoost"] });
    const b2 = unit(1, { abilities: ["moraleBoost"] });
    const other = unit(5);
    const r = row([b1, b2, other]);
    expect(unitPower(r, other)).toBe(7);
    expect(unitPower(r, b1)).toBe(2); // boosted by b2 only
  });

  it("does not boost heroes", () => {
    const booster = unit(2, { abilities: ["moraleBoost"] });
    const hero = unit(10, { hero: true });
    expect(unitPower(row([booster, hero]), hero)).toBe(10);
  });
});

describe("commander's horn", () => {
  it("doubles every non-hero unit when a horn card is on the row", () => {
    const r = row([unit(3), unit(4), unit(9, { hero: true })], { hornCard: true });
    expect(rowPower(r)).toBe(6 + 8 + 9);
  });

  it("a horn unit doubles others but not itself", () => {
    const horn = unit(2, { abilities: ["horn"] });
    const other = unit(5);
    const r = row([horn, other]);
    expect(unitPower(r, horn)).toBe(2);
    expect(unitPower(r, other)).toBe(10);
  });

  it("does not stack: two horn sources still double once", () => {
    const horn = unit(2, { abilities: ["horn"] });
    const other = unit(5);
    expect(unitPower(row([horn, other], { hornCard: true }), other)).toBe(10);
  });

  it("a horn card also doubles a horn unit", () => {
    const horn = unit(2, { abilities: ["horn"] });
    expect(unitPower(row([horn], { hornCard: true }), horn)).toBe(4);
  });
});

describe("order of effects", () => {
  it("weather, then bond, then morale, then horn", () => {
    const a = unit(4, { abilities: ["tightBond"], bond: "g" });
    const b = unit(4, { abilities: ["tightBond"], bond: "g" });
    const booster = unit(1, { abilities: ["moraleBoost"] });
    const r = row([a, b, booster], { weather: true, hornCard: true });
    // a: weather 1, bond x2 = 2, morale +1 = 3, horn x2 = 6
    expect(unitPower(r, a)).toBe(6);
    // booster: weather 1, no bond, no morale from itself, horn x2 = 2
    expect(unitPower(r, booster)).toBe(2);
  });
});
