// Default button layout per input context.
//
// These are the *in-app* defaults. Players remap physical controls with Steam Input
// (which sits in front of this app), so this table only needs to be sensible, not
// complete. Every value is a key DCSS already understands.

import type { InputContext } from "./context";
import type { RadialKind } from "./radial";

/** Standard Gamepad API button indices (Steam Input presents an Xbox-style pad). */
export const Btn = {
  A: 0, B: 1, X: 2, Y: 3,
  LB: 4, RB: 5, LT: 6, RT: 7,
  Back: 8, Start: 9, LS: 10, RS: 11,
  Up: 12, Down: 13, Left: 14, Right: 15,
} as const;
export type ButtonName = keyof typeof Btn;

/**
 * A key as Electron's `sendInputEvent` understands it: a single character, or a
 * named key (Enter, Escape, Tab, Backspace, Up, Down, Left, Right, PageUp, PageDown).
 */
export interface KeyStroke {
  key: string;
  shift?: boolean;
  ctrl?: boolean;
}

export interface Binding {
  stroke: KeyStroke;
  /** Auto-repeat while held. */
  repeat?: boolean;
  /** Short label for the on-screen hint bar. */
  label: string;
  /** Holding the button (instead of tapping it) opens this radial menu. */
  radial?: RadialKind;
}

export type Layer = Partial<Record<ButtonName, Binding>>;

const k = (key: string, label: string, extra: Partial<Binding> & Partial<KeyStroke> = {}): Binding => ({
  stroke: { key, shift: extra.shift, ctrl: extra.ctrl },
  repeat: extra.repeat,
  radial: extra.radial,
  label,
});

const arrows: Layer = {
  Up: k("Up", "Up", { repeat: true }),
  Down: k("Down", "Down", { repeat: true }),
  Left: k("Left", "Left", { repeat: true }),
  Right: k("Right", "Right", { repeat: true }),
};

/** Map mode, no modifier held. A + stick (move) and RT (run) are handled in controller.ts. */
const mapBase: Layer = {
  // No B here: Escape on the map only prints "Unknown command". Prompts and menus have
  // their own contexts where B cancels.
  X: k("o", "Explore"),
  Y: k("Tab", "Autofight", { repeat: true }),
  LB: k("i", "Inventory", { radial: "items" }),
  RB: k("z", "Cast", { radial: "spells" }),
  Up: k("<", "Go up"),
  Down: k(">", "Go down"),
  Left: k("g", "Pick up"),
  Right: k("5", "Rest"),
  Back: k("x", "Look", { radial: "abilities" }),
  Start: k("?", "Help", { radial: "commands" }),
  LS: k("%", "Character"),
  RS: k("s", "Wait", { repeat: true }),
};

/** Map mode with LT held. */
const mapAlt: Layer = {
  A: k("f", "Fire"),
  B: k("q", "Quaff"),
  X: k("r", "Read"),
  Y: k("a", "Abilities"),
  LB: k("w", "Wield"),
  RB: k("W", "Wear"),
  Up: k("G", "Travel"),
  Down: k("X", "Map"),
  Left: k("P", "Put on"),
  Right: k("R", "Remove"),
  Back: k("m", "Skills"),
  Start: k("s", "Save & quit", { ctrl: true }),
};

export const LAYERS: Record<InputContext, { base: Layer; alt?: Layer }> = {
  map: { base: mapBase, alt: mapAlt },
  // Nothing to do until the game is ready (View + Menu still returns to the launcher).
  loading: { base: {} },
  target: {
    base: {
      A: k("Enter", "Confirm"),
      B: k("Escape", "Cancel"),
      LB: k("-", "Prev target"),
      RB: k("+", "Next target"),
      X: k("v", "Describe"),
    },
  },
  menu: {
    base: {
      ...arrows,
      A: k("Enter", "Select"),
      B: k("Escape", "Back"),
      LB: k("PageUp", "Page up", { repeat: true }),
      RB: k("PageDown", "Page down", { repeat: true }),
    },
  },
  more: { base: { A: k("Enter", "Continue"), B: k("Escape", "Skip") } },
  yesno: { base: { A: k("y", "Yes"), B: k("n", "No") } },
  prompt: { base: { ...arrows, A: k("Enter", "OK"), B: k("Escape", "Cancel") } },
  text: { base: { A: k("Enter", "Submit"), B: k("Escape", "Cancel"), X: k("Backspace", "Delete", { repeat: true }) } },
  lobby: {
    base: {
      ...arrows,
      A: k("Enter", "Select"),
      B: k("Escape", "Back"),
      LB: k("Tab", "Prev field", { shift: true }),
      RB: k("Tab", "Next field"),
    },
  },
};

/** Which contexts use the left stick for Qud-style "aim, then press A". */
export const AIM_CONTEXTS: ReadonlySet<InputContext> = new Set(["map"]);
/** Which contexts move a cursor directly with the left stick (with auto-repeat). */
export const CURSOR_CONTEXTS: ReadonlySet<InputContext> = new Set(["target"]);
/** Which contexts treat the left stick as arrow keys. */
export const ARROW_STICK_CONTEXTS: ReadonlySet<InputContext> = new Set(["menu", "prompt", "lobby"]);

export const REPEAT_DELAY_MS = 300;
/** Holding a radial button this long opens its radial; a shorter press is a tap. */
export const RADIAL_HOLD_MS = 250;
export const REPEAT_INTERVAL_MS = 120;
