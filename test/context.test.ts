import { describe, expect, it } from "vitest";
import { ContextTracker, MouseMode } from "../src/shared/context";

const dom = { uiPopups: 0, legacyMenu: false, textFocused: false };

describe("ContextTracker", () => {
  it("starts in the lobby", () => {
    expect(new ContextTracker().current(dom)).toBe("lobby");
  });

  it("follows input_mode once a game starts", () => {
    const t = new ContextTracker();
    t.handle({ msg: "game_started" });
    expect(t.current(dom)).toBe("map");
    t.handle({ msg: "input_mode", mode: MouseMode.TARGET });
    expect(t.current(dom)).toBe("target");
    t.handle({ msg: "input_mode", mode: MouseMode.MORE });
    expect(t.current(dom)).toBe("more");
  });

  it("prioritises text input, then menus", () => {
    const t = new ContextTracker();
    t.handle({ msg: "game_started" });
    expect(t.current({ ...dom, uiPopups: 1 })).toBe("menu");
    t.handle({ msg: "init_input" });
    expect(t.current({ ...dom, uiPopups: 1 })).toBe("text");
    t.handle({ msg: "close_input" });
    expect(t.current(dom)).toBe("map");
  });

  it("returns to the lobby when the game ends", () => {
    const t = new ContextTracker();
    t.handle({ msg: "game_started" });
    t.handle({ msg: "game_ended" });
    expect(t.current(dom)).toBe("lobby");
  });
});
