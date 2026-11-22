import { describe, expect, it } from "vitest";
import { ContextTracker, MouseMode } from "../src/shared/context";

const dom = { lobbyVisible: false, uiPopups: 0, legacyMenu: false, textFocused: false };
const lobby = { ...dom, lobbyVisible: true };

describe("ContextTracker", () => {
  it("is in the lobby while the lobby or loader is showing", () => {
    expect(new ContextTracker().current(lobby)).toBe("lobby");
  });

  it("detects menus even if game_started was missed (e.g. character creation)", () => {
    expect(new ContextTracker().current({ ...dom, uiPopups: 1 })).toBe("menu");
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

  it("resets the targeting mode when a game ends", () => {
    const t = new ContextTracker();
    t.handle({ msg: "input_mode", mode: MouseMode.TARGET });
    t.handle({ msg: "game_ended" });
    expect(t.current(dom)).toBe("map");
  });
});
