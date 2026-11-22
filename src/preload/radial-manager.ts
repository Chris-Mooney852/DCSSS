// Fills radial menus with game data and carries out the chosen entry.
//
// - commands: a fixed list
// - items:    the client's inventory (via the page hook), used with inv_item_action
// - spells:   "z" then "*" opens the game's spell menu; we read its items and hide it
// - abilities: "a" opens the ability menu, read the same way

import type { KeyStroke } from "../shared/bindings";
import { MouseMode, type InputContext, type ProtocolMessage } from "../shared/context";
import {
  COMMAND_ENTRIES, itemEntries, menuEntries, RadialState,
  type InvItem, type MenuItem, type RadialEntry, type RadialKind,
} from "../shared/radial";
import type { Direction } from "../shared/stick";

const MENU_TIMEOUT_MS = 1200;

export interface RadialView {
  state: RadialState;
  loading: boolean;
}

export interface RadialHost {
  sendKeys(keys: KeyStroke[]): void;
  /** Ask the page hook for something; resolves with its reply (null on timeout). */
  request(type: string, extra?: Record<string, unknown>): Promise<unknown>;
  context(): InputContext;
}

export class RadialManager {
  private state: RadialState | null = null;
  private loading = false;
  /** We opened a game menu (or prompt) to read it; it must be closed or answered. */
  private gameMenuOpen = false;
  /** Bumped on every open/close so stale async loads are ignored. */
  private generation = 0;
  private waiters: ((m: ProtocolMessage) => void)[] = [];

  constructor(private readonly host: RadialHost) {}

  get view(): RadialView | null {
    return this.state ? { state: this.state, loading: this.loading } : null;
  }

  /** Feed every forwarded protocol message here. */
  onProtocol(m: ProtocolMessage): void {
    for (const w of [...this.waiters]) w(m);
  }

  async open(kind: RadialKind): Promise<void> {
    const gen = ++this.generation;
    this.state = new RadialState(kind, []);
    this.loading = true;
    this.setGameMenuHidden(true);
    let entries: RadialEntry[] = [];
    try {
      entries = await this.load(kind);
    } catch {
      entries = [];
    }
    if (gen !== this.generation) return; // closed meanwhile
    this.state = new RadialState(kind, entries);
    this.loading = false;
  }

  point(dir: Direction | null): void {
    this.state?.point(dir);
  }

  turnPage(delta: number): void {
    this.state?.turnPage(delta);
  }

  confirm(): void {
    const entry = this.loading ? null : this.state?.selected() ?? null;
    if (!entry) {
      this.cancel();
      return;
    }
    const wasMenu = this.gameMenuOpen;
    this.close();
    const effect = entry.effect;
    if (effect.type === "keys") {
      // For spells/abilities this answers the open game menu with the hotkey.
      this.host.sendKeys(effect.keys);
    } else {
      if (wasMenu) this.host.sendKeys([{ key: "Escape" }]);
      void this.host.request("item-action", { slot: effect.slot });
    }
  }

  cancel(): void {
    const wasMenu = this.gameMenuOpen;
    this.close();
    if (wasMenu) this.closeGameMenu();
  }

  private close(): void {
    this.generation++;
    this.state = null;
    this.loading = false;
    this.gameMenuOpen = false;
    this.waiters = [];
    this.setGameMenuHidden(false);
  }

  private async load(kind: RadialKind): Promise<RadialEntry[]> {
    switch (kind) {
      case "commands":
        return COMMAND_ENTRIES;
      case "items": {
        const inv = await this.host.request("inventory");
        return Array.isArray(inv) ? itemEntries(inv as InvItem[]) : [];
      }
      case "spells": {
        // 0.34 first shows a "Casting: <spell>" prompt; "*" lists all spells.
        this.gameMenuOpen = true;
        const first = this.waitFor((m) => isMenu(m) || isPrompt(m));
        this.host.sendKeys([{ key: "z" }]);
        let m = await first;
        if (m && isPrompt(m)) {
          const menu = this.waitFor(isMenu);
          this.host.sendKeys([{ key: "*" }]);
          m = await menu;
        }
        return m && isMenu(m) ? menuEntries((m.items as MenuItem[]) ?? []) : [];
      }
      case "abilities": {
        this.gameMenuOpen = true;
        const menu = this.waitFor(isMenu);
        this.host.sendKeys([{ key: "a" }]);
        const m = await menu;
        return m ? menuEntries((m.items as MenuItem[]) ?? []) : [];
      }
    }
  }

  private waitFor(match: (m: ProtocolMessage) => boolean): Promise<ProtocolMessage | null> {
    return new Promise((resolve) => {
      const waiter = (m: ProtocolMessage) => {
        if (!match(m)) return;
        this.waiters = this.waiters.filter((w) => w !== waiter);
        clearTimeout(timer);
        resolve(m);
      };
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== waiter);
        resolve(null);
      }, MENU_TIMEOUT_MS);
      this.waiters.push(waiter);
    });
  }

  /** Escape out of whatever we opened (menu, then possibly the cast prompt behind it). */
  private closeGameMenu(): void {
    this.host.sendKeys([{ key: "Escape" }]);
    setTimeout(() => {
      const ctx = this.host.context();
      if (ctx === "menu" || ctx === "prompt") this.host.sendKeys([{ key: "Escape" }]);
    }, 300);
  }

  /** While a radial reads a game menu, keep that menu out of sight. */
  private setGameMenuHidden(hidden: boolean): void {
    document.documentElement.classList.toggle("deck-radial-open", hidden);
  }
}

const isMenu = (m: ProtocolMessage) => m.msg === "menu";
const isPrompt = (m: ProtocolMessage) => m.msg === "input_mode" && m.mode === MouseMode.PROMPT;
