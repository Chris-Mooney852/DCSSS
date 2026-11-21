import { describe, expect, it } from "vitest";
import { Btn, REPEAT_DELAY_MS, REPEAT_INTERVAL_MS } from "../src/shared/bindings";
import { Controller, type PadSnapshot } from "../src/shared/controller";

function pad(pressed: number[] = [], lx = 0, ly = 0): PadSnapshot {
  const buttons = Array.from({ length: 17 }, (_, i) => pressed.includes(i));
  return { buttons, axes: [lx, ly, 0, 0] };
}

const keys = (r: { actions: { type: string; stroke?: { key: string } }[] }) =>
  r.actions.map((a) => (a.type === "key" ? a.stroke!.key : a.type));

describe("Controller in map mode", () => {
  it("does not move when only the stick is pushed", () => {
    const c = new Controller();
    const r = c.frame(pad([], 1, 0), "map", 0);
    expect(keys(r)).toEqual([]);
    expect(r.aimed).toBe("E");
  });

  it("moves in the aimed direction when A is pressed", () => {
    const c = new Controller();
    c.frame(pad([], 0, -1), "map", 0);
    expect(keys(c.frame(pad([Btn.A], 0, -1), "map", 16))).toEqual(["k"]);
  });

  it("runs when RT is held", () => {
    const c = new Controller();
    const r = c.frame(pad([Btn.A, Btn.RT], -1, 0), "map", 0);
    expect(r.actions).toEqual([{ type: "key", stroke: { key: "H", shift: true } }]);
  });

  it("repeats while A is held and follows the stick", () => {
    const c = new Controller();
    expect(keys(c.frame(pad([Btn.A], 1, 0), "map", 0))).toEqual(["l"]);
    expect(keys(c.frame(pad([Btn.A], 1, 0), "map", REPEAT_DELAY_MS - 1))).toEqual([]);
    expect(keys(c.frame(pad([Btn.A], 1, 0), "map", REPEAT_DELAY_MS))).toEqual(["l"]);
    expect(keys(c.frame(pad([Btn.A], 0, 1), "map", REPEAT_DELAY_MS + REPEAT_INTERVAL_MS))).toEqual(["j"]);
  });

  it("does not start moving when A was held over from a menu", () => {
    const c = new Controller();
    expect(keys(c.frame(pad([Btn.A]), "menu", 0))).toEqual(["Enter"]);
    expect(keys(c.frame(pad([Btn.A], 1, 0), "map", 16))).toEqual([]);
    expect(keys(c.frame(pad([Btn.A], 1, 0), "map", 1000))).toEqual([]);
  });

  it("uses the LT layer for face buttons", () => {
    const c = new Controller();
    expect(keys(c.frame(pad([Btn.LT, Btn.B]), "map", 0))).toEqual(["q"]);
    expect(keys(c.frame(pad([]), "map", 16))).toEqual([]);
    expect(keys(c.frame(pad([Btn.B]), "map", 32))).toEqual(["Escape"]);
  });

  it("returns to the launcher on View + Menu without sending either key", () => {
    const c = new Controller();
    expect(keys(c.frame(pad([Btn.Back, Btn.Start]), "map", 0))).toEqual(["launcher"]);
  });
});

describe("Controller in other contexts", () => {
  it("moves the targeting cursor directly with the stick", () => {
    const c = new Controller();
    expect(keys(c.frame(pad([], 1, 0), "target", 0))).toEqual(["l"]);
    expect(keys(c.frame(pad([], 1, 0), "target", 50))).toEqual([]);
    expect(keys(c.frame(pad([], 1, 0), "target", REPEAT_DELAY_MS))).toEqual(["l"]);
    expect(keys(c.frame(pad([Btn.A], 1, 0), "target", REPEAT_DELAY_MS + 1))).toEqual(["Enter"]);
  });

  it("turns the stick into arrow keys in menus", () => {
    const c = new Controller();
    expect(keys(c.frame(pad([], 0, 1), "menu", 0))).toEqual(["Down"]);
  });

  it("answers yes/no prompts with A and B", () => {
    const c = new Controller();
    expect(keys(c.frame(pad([Btn.A]), "yesno", 0))).toEqual(["y"]);
  });
});
