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

  it("uses the LT layer for face buttons (and B does nothing on the map itself)", () => {
    const c = new Controller();
    expect(keys(c.frame(pad([Btn.LT, Btn.B]), "map", 0))).toEqual(["q"]);
    expect(keys(c.frame(pad([]), "map", 16))).toEqual([]);
    expect(keys(c.frame(pad([Btn.B]), "map", 24))).toEqual([]);
    expect(keys(c.frame(pad([Btn.X]), "map", 32))).toEqual(["o"]);
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

describe("Controller radials", () => {
  const types = (r: { actions: { type: string }[] }) => r.actions.map((a) => a.type);

  it("taps a radial button to send its key on release", () => {
    const c = new Controller();
    expect(keys(c.frame(pad([Btn.LB]), "map", 0))).toEqual([]);
    expect(keys(c.frame(pad([]), "map", 100))).toEqual(["i"]);
  });

  it("opens the radial when held, points with the stick, and confirms on release", () => {
    const c = new Controller();
    c.frame(pad([Btn.RB]), "map", 0);
    expect(c.frame(pad([Btn.RB]), "map", 300).actions).toEqual([{ type: "radial-open", kind: "spells" }]);
    expect(c.radialOpen).toBe(true);
    // Context changes underneath (the game opens its spell menu) don't matter.
    expect(c.frame(pad([Btn.RB], 0, -1), "menu", 320).actions).toEqual([{ type: "radial-point", dir: "N" }]);
    expect(types(c.frame(pad([Btn.RB], 0, -1), "menu", 340))).toEqual([]);
    expect(types(c.frame(pad([], 0, -1), "menu", 360))).toEqual(["radial-confirm"]);
    expect(c.radialOpen).toBe(false);
    // Releasing did not also tap "z".
    expect(keys(c.frame(pad([]), "map", 400))).toEqual([]);
  });

  it("cancels with B and ignores the trigger until it is released", () => {
    const c = new Controller();
    c.frame(pad([Btn.Start]), "map", 0);
    c.frame(pad([Btn.Start]), "map", 300);
    expect(types(c.frame(pad([Btn.Start, Btn.B]), "map", 320))).toEqual(["radial-cancel"]);
    expect(keys(c.frame(pad([Btn.Start]), "map", 340))).toEqual([]);
    expect(keys(c.frame(pad([]), "map", 360))).toEqual([]);
  });

  it("confirms with A and does not step afterwards", () => {
    const c = new Controller();
    c.frame(pad([Btn.LB]), "map", 0);
    c.frame(pad([Btn.LB]), "map", 300);
    expect(types(c.frame(pad([Btn.LB, Btn.A], 1, 0), "map", 320))).toEqual(["radial-point", "radial-confirm"]);
    expect(keys(c.frame(pad([Btn.A], 1, 0), "map", 340))).toEqual([]);
    expect(keys(c.frame(pad([Btn.A], 1, 0), "map", 1000))).toEqual([]);
  });

  it("pages with the D-pad", () => {
    const c = new Controller();
    c.frame(pad([Btn.LB]), "map", 0);
    c.frame(pad([Btn.LB]), "map", 300);
    expect(c.frame(pad([Btn.LB, Btn.Right]), "map", 320).actions).toEqual([{ type: "radial-page", delta: 1 }]);
  });

  it("View + Menu still returns to the launcher, without opening a radial", () => {
    const c = new Controller();
    c.frame(pad([Btn.Back]), "map", 0);
    expect(types(c.frame(pad([Btn.Back, Btn.Start]), "map", 50))).toEqual(["launcher"]);
    expect(types(c.frame(pad([Btn.Back, Btn.Start]), "map", 600))).toEqual([]);
    expect(types(c.frame(pad([]), "map", 650))).toEqual([]);
  });
});

describe("Controller radial release grace", () => {
  it("uses the slot the stick just left when stick and button are released together", () => {
    const c = new Controller();
    c.frame(pad([Btn.Start]), "map", 0);
    c.frame(pad([Btn.Start]), "map", 300);
    c.frame(pad([Btn.Start], 1, 0), "map", 320);
    // Same frame: stick centred and button released.
    expect(c.frame(pad([]), "map", 340).actions).toEqual([
      { type: "radial-point", dir: null },
      { type: "radial-point", dir: "E" },
      { type: "radial-confirm" },
    ]);
  });

  it("does not use a slot the stick left a while ago", () => {
    const c = new Controller();
    c.frame(pad([Btn.Start]), "map", 0);
    c.frame(pad([Btn.Start]), "map", 300);
    c.frame(pad([Btn.Start], 1, 0), "map", 320);
    c.frame(pad([Btn.Start]), "map", 340);
    expect(c.frame(pad([]), "map", 800).actions).toEqual([{ type: "radial-confirm" }]);
  });
});
