// End-to-end: the real app, the real bundled DCSS server, driven only by a simulated gamepad.

import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";
import { launch, offlineAvailable, sleep, type Deck } from "./harness";

test.skip(!offlineAvailable(), "needs an offline DCSS build (npm run setup:offline or bundle/)");

let deck: Deck;

test.beforeEach(async () => {
  deck = await launch();
});

test.afterEach(async () => {
  await deck.close();
});

/** Total game time, e.g. "2.0" (the panel also shows the last action's cost: "2.0 (1.0)"). */
const turn = async () => (await deck.page.locator("#stats_time").innerText()).split(" ")[0];

async function expectContext(want: string): Promise<void> {
  await expect.poll(() => deck.context(), { message: `context should be ${want}` }).toBe(want);
}

/** Launcher → Play offline → pick the first species, background and weapon. */
async function startNewGame(): Promise<void> {
  const { page, pad } = deck;
  await expect(page.locator("#play-offline")).toBeFocused();
  await expect(page.locator("#play-offline")).toContainText(/Play DCSS \d+\.\d+/);
  await pad.press("A");
  await expect.poll(() => page.url()).toContain("#play-dcss-deck");

  // Character creation: species, background and (for some backgrounds) weapon menus. The
  // stick moves the highlight like arrow keys, A selects. Keep picking until the map shows.
  await expectContext("menu");
  for (let i = 0; i < 4 && (await deck.context()) === "menu"; i++) {
    await pad.aim(0, 1);
    await sleep(150);
    await pad.aim(0, 0);
    await pad.press("A");
    await expect.poll(() => deck.context(), { timeout: 5000 }).not.toBe("lobby");
    await sleep(1000);
  }
  await expectContext("map");
  await expect(page.locator("#dcss-deck-overlay")).toBeAttached();
}

test("plays offline with the controller: create, move, menus, targeting, save and resume", async () => {
  const { page, pad } = deck;
  await startNewGame();

  // Caves of Qud movement: aiming alone does nothing...
  const before = await turn();
  for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    await pad.aim(x, y);
    await sleep(150);
  }
  await pad.aim(0, 0);
  await sleep(300);
  expect(await turn()).toBe(before);

  // ...A commits a step. Try each direction until one isn't blocked by a wall.
  let moved = false;
  for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const) {
    await pad.aim(x, y);
    await sleep(100);
    await pad.press("A");
    await pad.aim(0, 0);
    await sleep(400);
    if ((await turn()) !== before) { moved = true; break; }
  }
  expect(moved, "a step with stick + A should take a turn").toBe(true);

  // R3 waits a turn.
  const t1 = await turn();
  await pad.press("RS");
  await expect.poll(turn).not.toBe(t1);

  // LB opens the inventory (a menu); B closes it.
  await pad.press("LB");
  await expectContext("menu");
  await pad.press("B");
  await expectContext("map");

  // View = look around (targeting); the stick moves the cursor; B cancels.
  await pad.press("Back");
  await expectContext("target");
  await pad.aim(1, 0);
  await sleep(200);
  await pad.aim(0, 0);
  await expectContext("target");
  await pad.press("B");
  await expectContext("map");

  // Holding LT switches to the second layer: LT + Menu = save and quit → launcher.
  const savedTurn = await turn();
  await pad.hold("LT");
  await sleep(100);
  await pad.press("Start");
  await pad.release("LT");
  await expect.poll(() => page.url()).toMatch(/^file:/);
  await expect(page.locator("#play-offline")).toBeFocused();

  // A on Play offline resumes the saved game.
  await pad.press("A");
  await expectContext("map");
  await expect.poll(turn).toBe(savedTurn);
});

test("View + Menu returns to the launcher from a running game", async () => {
  const { page, pad } = deck;
  await startNewGame();
  await pad.press("Back", "Start");
  await expect.poll(() => page.url()).toMatch(/^file:/);
  // The game was saved when the connection closed, so Play offline resumes it.
  await pad.press("A");
  await expectContext("map");
});

test("shows the server log when the offline server crashes, and recovers", async () => {
  const { page, pad, dataDir } = deck;
  await startNewGame();

  // Kill this test's server (matched by its unique data dir).
  execSync(`pkill -f "[d]eck_server.py .*${dataDir}"`);
  await expect(page.locator("#error")).toBeVisible();
  await expect(page.locator("#error-message")).toContainText("stopped unexpectedly");
  await expect(page.locator("#play-offline")).toBeFocused();

  await pad.press("A");
  await expectContext("map");
});
