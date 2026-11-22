// End-to-end: radial menus (hold LB / RB / View / Menu) against the real game.

import { expect, test } from "@playwright/test";
import { launch, offlineAvailable, type Deck } from "./harness";
import type { ButtonName } from "../src/shared/bindings";

test.skip(!offlineAvailable(), "needs an offline DCSS build (npm run setup:offline or bundle/)");

let deck: Deck;

// A Human Wizard: knows Magic Dart, has no abilities. The rc file skips character creation.
test.beforeEach(async () => {
  deck = await launch({ rc: "species = human\nbackground = wizard\n" });
  await expect(deck.page.locator("#play-offline")).toBeFocused();
  await deck.pad.press("A");
  await expectContext("map");
});

test.afterEach(async () => {
  await deck.close();
});

async function expectContext(want: string): Promise<void> {
  await expect.poll(() => deck.context(), { message: `context should be ${want}` }).toBe(want);
}

const overlay = () => deck.page.locator("#dcss-deck-overlay");
const messages = () => deck.page.locator("#messages").innerText();

/** Hold a button until its radial is open and loaded. */
async function openRadial(button: ButtonName, kind: string): Promise<void> {
  await deck.pad.hold(button);
  await expect(overlay()).toHaveAttribute("data-radial", kind);
  await expect.poll(async () => (await overlay().getAttribute("data-radial-entries")) !== null).toBe(true);
}

async function pointAt(x: number, y: number, label: string): Promise<void> {
  await deck.pad.aim(x, y);
  await expect(overlay()).toHaveAttribute("data-radial-selected", label);
}

test("command radial: hold Menu, point, release", async () => {
  await openRadial("Start", "commands");
  await pointAt(0.7, -0.7, "Skills"); // NE
  await deck.pad.release("Start");
  await deck.pad.aim(0, 0);
  await expect(overlay()).toHaveAttribute("data-radial", "");
  await expectContext("menu"); // the skills screen
  await deck.pad.press("B");
  await expectContext("map");
});

test("spell radial: lists known spells and casts the chosen one", async () => {
  await openRadial("RB", "spells");
  await expect(overlay()).toHaveAttribute("data-radial-entries", "1");
  await pointAt(0, -1, "Magic Dart");
  await deck.pad.release("RB");
  await deck.pad.aim(0, 0);
  // The game takes over: targeting, or (no monster in view) its own refusal to waste MP.
  await expect.poll(async () =>
    (await deck.context()) === "target" ||
    (await messages()).includes("can't see any susceptible monsters")).toBe(true);
  if ((await deck.context()) === "target") await deck.pad.press("B");
  await expectContext("map");
});

test("spell radial: B cancels and closes the game's menu too", async () => {
  await openRadial("RB", "spells");
  await expect(overlay()).toHaveAttribute("data-radial-entries", "1");
  await deck.pad.press("B");
  await deck.pad.release("RB");
  await expect(overlay()).toHaveAttribute("data-radial", "");
  await expectContext("map");
});

test("item radial: uses a consumable with its default action", async () => {
  await openRadial("LB", "items");
  await expect.poll(async () => Number(await overlay().getAttribute("data-radial-entries"))).toBeGreaterThan(0);
  await pointAt(0, -1, "potion of magic");
  await deck.pad.release("LB");
  await deck.pad.aim(0, 0);
  // The Wizard starts with full magic, so the game answers the drink attempt with this.
  await expect.poll(messages).toContain("Your magic is already full");
  await expectContext("map");
});

test("ability radial: shows nothing for a character without abilities, and recovers", async () => {
  await openRadial("Back", "abilities");
  await expect(overlay()).toHaveAttribute("data-radial-entries", "0");
  await deck.pad.release("Back");
  await expect(overlay()).toHaveAttribute("data-radial", "");
  await expectContext("map");
  // Taps still work afterwards: tap LB = inventory.
  await deck.pad.press("LB");
  await expectContext("menu");
  await deck.pad.press("B");
  await expectContext("map");
});
