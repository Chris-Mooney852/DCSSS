// Radial menus: up to 8 entries per page, picked with the left stick.
// Pure logic (layout, paging, selection) so it can be unit tested.

import type { KeyStroke } from "./bindings";
import type { Direction } from "./stick";

export type RadialKind = "items" | "spells" | "abilities" | "commands";

export const RADIAL_TITLES: Record<RadialKind, string> = {
  items: "Items",
  spells: "Spells",
  abilities: "Abilities",
  commands: "Commands",
};

/** What choosing an entry does. */
export type RadialEffect =
  | { type: "keys"; keys: KeyStroke[] }
  /** Use an inventory item's default action (quaff, read, evoke, throw...). */
  | { type: "item"; slot: number };

export interface RadialEntry {
  label: string;
  /** Short extra text: quantity, failure chance, key... */
  detail?: string;
  /** Shown dimmed (e.g. useless items, spells too hard to cast). */
  dim?: boolean;
  effect: RadialEffect;
}

/** Slot directions, clockwise from the top. */
export const SLOT_DIRECTIONS: readonly Direction[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export const PAGE_SIZE = SLOT_DIRECTIONS.length;

/**
 * Which of the 8 slots each of `count` entries occupies, spread evenly so that few
 * entries are easy to hit: 2 → N, S; 4 → N, E, S, W.
 */
export function slotPositions(count: number): number[] {
  const n = Math.min(count, PAGE_SIZE);
  return Array.from({ length: n }, (_, i) => Math.round((i * PAGE_SIZE) / n) % PAGE_SIZE);
}

export class RadialState {
  page = 0;
  /** Slot (0-7) the stick points at, or null. */
  slot: number | null = null;

  constructor(readonly kind: RadialKind, readonly entries: RadialEntry[]) {}

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.entries.length / PAGE_SIZE));
  }

  /** Entries on the current page with the slot each occupies. */
  visible(): { entry: RadialEntry; slot: number }[] {
    const pageEntries = this.entries.slice(this.page * PAGE_SIZE, (this.page + 1) * PAGE_SIZE);
    const slots = slotPositions(pageEntries.length);
    return pageEntries.map((entry, i) => ({ entry, slot: slots[i]! }));
  }

  point(dir: Direction | null): void {
    this.slot = dir === null ? null : SLOT_DIRECTIONS.indexOf(dir);
  }

  turnPage(delta: number): void {
    const n = this.pageCount;
    this.page = (this.page + delta + n) % n;
  }

  /** The entry under the stick, if any. */
  selected(): RadialEntry | null {
    if (this.slot === null) return null;
    return this.visible().find((v) => v.slot === this.slot)?.entry ?? null;
  }
}

// ---- Turning game data into entries ----------------------------------------------

/** An inventory item as the webtiles client stores it (player.inv). */
export interface InvItem {
  slot: number;
  name?: string;
  quantity?: number;
  plus?: number;
  qty_field?: string;
  action_panel_order?: number;
  action_verb?: string;
  useless?: number | boolean;
  sub_type?: number;
}

/** Same filter and order as the client's consumables panel (action_panel.js). */
export function itemEntries(inv: InvItem[]): RadialEntry[] {
  return inv
    .filter((i) => i.quantity && (i.action_panel_order ?? -1) >= 0 && i.name)
    .sort((a, b) =>
      a.action_panel_order === b.action_panel_order
        ? (a.sub_type ?? 0) - (b.sub_type ?? 0)
        : (a.action_panel_order ?? 0) - (b.action_panel_order ?? 0))
    .map((i) => {
      // Wands and evokers count charges ("plus"); everything else counts items.
      const amount = i.qty_field === "plus"
        ? `${i.plus ?? 0} charges`
        : (i.quantity ?? 0) > 1 ? `×${i.quantity}` : "";
      return {
        label: i.name!,
        detail: [i.action_verb ?? "", amount].filter(Boolean).join(" · "),
        dim: !!i.useless,
        effect: { type: "item", slot: i.slot },
      };
    });
}

/** A menu item from a webtiles "menu" message. */
export interface MenuItem {
  text?: string;
  hotkeys?: number[];
  colour?: number;
}

const DARKGREY = 8;

/**
 * Turns a game menu (spells, abilities) into entries that press the item's hotkey.
 * Item text looks like " a + <darkgrey>Magic Dart     Conjuration     <lightgrey>10%</lightgrey>  1".
 */
export function menuEntries(items: MenuItem[]): RadialEntry[] {
  const out: RadialEntry[] = [];
  for (const item of items) {
    const key = item.hotkeys?.[0];
    if (key === undefined || !item.text) continue;
    const plain = item.text.replace(/<[^>]*>/g, "");
    const body = plain.replace(/^\s*\S\s*[-+#]?\s+/, "");
    const columns = body.trim().split(/\s{2,}/);
    const label = columns[0] ?? body.trim();
    const pct = body.match(/\d+%/)?.[0];
    out.push({
      label,
      detail: pct ? `${pct} fail` : columns[1],
      dim: item.colour === DARKGREY,
      effect: { type: "keys", keys: [{ key: String.fromCharCode(key) }] },
    });
  }
  return out;
}

/** The fixed command radial (hold Menu). */
export const COMMAND_ENTRIES: RadialEntry[] = [
  { label: "Level map", detail: "X", effect: { type: "keys", keys: [{ key: "X" }] } },
  { label: "Skills", detail: "m", effect: { type: "keys", keys: [{ key: "m" }] } },
  { label: "Character", detail: "%", effect: { type: "keys", keys: [{ key: "%" }] } },
  { label: "Messages", detail: "Ctrl+P", effect: { type: "keys", keys: [{ key: "p", ctrl: true }] } },
  { label: "Travel", detail: "G", effect: { type: "keys", keys: [{ key: "G" }] } },
  { label: "Pray", detail: "p", effect: { type: "keys", keys: [{ key: "p" }] } },
  { label: "Find", detail: "Ctrl+F", effect: { type: "keys", keys: [{ key: "f", ctrl: true }] } },
  { label: "Spell list", detail: "I", effect: { type: "keys", keys: [{ key: "I" }] } },
];
