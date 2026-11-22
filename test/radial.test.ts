import { describe, expect, it } from "vitest";
import { COMMAND_ENTRIES, itemEntries, menuEntries, RadialState, slotPositions, type RadialEntry } from "../src/shared/radial";

const entry = (label: string): RadialEntry => ({ label, effect: { type: "keys", keys: [{ key: label }] } });

describe("slotPositions", () => {
  it("spreads few entries out so they are easy to hit", () => {
    expect(slotPositions(1)).toEqual([0]);
    expect(slotPositions(2)).toEqual([0, 4]);
    expect(slotPositions(4)).toEqual([0, 2, 4, 6]);
    expect(slotPositions(8)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(slotPositions(12)).toHaveLength(8);
  });
});

describe("RadialState", () => {
  it("selects the entry the stick points at", () => {
    const r = new RadialState("commands", [entry("a"), entry("b"), entry("c"), entry("d")]);
    r.point("E");
    expect(r.selected()?.label).toBe("b");
    r.point("NE"); // empty slot between a and b
    expect(r.selected()).toBeNull();
    r.point(null);
    expect(r.selected()).toBeNull();
  });

  it("pages through more than 8 entries", () => {
    const r = new RadialState("items", Array.from({ length: 10 }, (_, i) => entry(String(i))));
    expect(r.pageCount).toBe(2);
    expect(r.visible()).toHaveLength(8);
    r.turnPage(1);
    expect(r.visible().map((v) => v.entry.label)).toEqual(["8", "9"]);
    r.point("S");
    expect(r.selected()?.label).toBe("9");
    r.turnPage(1);
    expect(r.page).toBe(0);
    r.turnPage(-1);
    expect(r.page).toBe(1);
  });
});

describe("itemEntries", () => {
  it("keeps consumables in action-panel order and uses the item's slot", () => {
    const entries = itemEntries([
      { slot: 0, name: "+0 dagger", quantity: 1, action_panel_order: -1 },
      { slot: 5, name: "3 scrolls of teleportation", quantity: 3, action_panel_order: 20, action_verb: "Read" },
      { slot: 52, name: "potion of magic", quantity: 1, action_panel_order: 10, action_verb: "Drink", useless: 1 },
      { slot: 7, name: "wand of flame (5)", quantity: 1, plus: 5, qty_field: "plus", action_panel_order: 30 },
      { slot: 8, name: "gone", quantity: 0, action_panel_order: 10 },
    ]);
    expect(entries.map((e) => e.label)).toEqual(["potion of magic", "3 scrolls of teleportation", "wand of flame (5)"]);
    expect(entries[0]).toMatchObject({ dim: true, detail: "Drink", effect: { type: "item", slot: 52 } });
    expect(entries[1]!.detail).toBe("Read · ×3");
    expect(entries[2]!.detail).toBe("5 charges");
  });
});

describe("menuEntries", () => {
  it("parses a real 0.34 spell menu item", () => {
    const entries = menuEntries([{
      text: " a + <darkgrey>Magic Dart                      Conjuration               <lightgrey>10%</lightgrey>      1      </darkgrey>",
      hotkeys: [97], colour: 8,
    }]);
    expect(entries).toEqual([{
      label: "Magic Dart", detail: "10% fail", dim: true,
      effect: { type: "keys", keys: [{ key: "a" }] },
    }]);
  });

  it("skips headers without hotkeys", () => {
    expect(menuEntries([{ text: "Your spells" }, { text: " b - Blink   Translocation", hotkeys: [98] }]))
      .toMatchObject([{ label: "Blink", detail: "Translocation" }]);
  });
});

describe("COMMAND_ENTRIES", () => {
  it("fits on one page", () => {
    expect(COMMAND_ENTRIES.length).toBeLessThanOrEqual(8);
  });
});
