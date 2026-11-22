import { describe, expect, it } from "vitest";
import { aim } from "../src/shared/stick";

describe("aim", () => {
  it("ignores small deflections", () => {
    expect(aim(0.2, 0.2, null)).toBeNull();
  });

  it("snaps to the 8 compass directions (y is down)", () => {
    expect(aim(1, 0, null)).toBe("E");
    expect(aim(0, -1, null)).toBe("N");
    expect(aim(-1, 0, null)).toBe("W");
    expect(aim(0, 1, null)).toBe("S");
    expect(aim(0.7, -0.7, null)).toBe("NE");
    expect(aim(-0.7, 0.7, null)).toBe("SW");
  });

  it("keeps the previous direction near a sector edge (hysteresis)", () => {
    // 25 degrees above east: past the 22.5 degree edge, but within the hysteresis margin.
    const a = (-25 * Math.PI) / 180;
    expect(aim(Math.cos(a), Math.sin(a), null)).toBe("NE");
    expect(aim(Math.cos(a), Math.sin(a), "E")).toBe("E");
  });

  it("holds the aim until the stick drops below the release zone", () => {
    expect(aim(0.4, 0, null)).toBeNull();
    expect(aim(0.4, 0, "E")).toBe("E");
    expect(aim(0.3, 0, "E")).toBeNull();
  });
});
