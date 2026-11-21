// Tracks what the game is currently asking for, from webtiles protocol messages
// plus a few DOM facts, so the controller can change behaviour per screen.

/** Mirrors `enums.mouse_mode` in crawl-ref/source/webserver/game_data/static/enums.js. */
export const MouseMode = {
  NORMAL: 0,
  COMMAND: 1,
  TARGET: 2,
  TARGET_DIR: 3,
  TARGET_PATH: 4,
  MORE: 5,
  MACRO: 6,
  PROMPT: 7,
  YESNO: 8,
} as const;

export type InputContext =
  | "lobby"   // server lobby / login screen, not in a game
  | "map"     // normal play: move, act
  | "target"  // choosing a target or direction
  | "menu"    // a menu or UI popup is open
  | "more"    // --more-- prompt
  | "yesno"   // y/n question
  | "prompt"  // single-key prompt
  | "text";   // a text field has focus (names, search, macro entry...)

export interface ProtocolMessage {
  msg: string;
  [key: string]: unknown;
}

/** Facts the preload reads from the page each frame. */
export interface DomFacts {
  /** Number of visible popups in #ui-stack. */
  uiPopups: number;
  /** A legacy #menu element is visible. */
  legacyMenu: boolean;
  /** document.activeElement is an <input> or <textarea>. */
  textFocused: boolean;
}

export class ContextTracker {
  private inGame = false;
  private mouseMode: number = MouseMode.NORMAL;
  private textInput = false;

  handle(m: ProtocolMessage): void {
    switch (m.msg) {
      case "game_started":
        this.inGame = true;
        this.mouseMode = MouseMode.NORMAL;
        break;
      case "game_ended":
      case "go_lobby":
        this.inGame = false;
        this.textInput = false;
        break;
      case "input_mode":
        if (typeof m.mode === "number") {
          this.mouseMode = m.mode;
          this.inGame = true;
        }
        break;
      case "init_input":
        this.textInput = true;
        break;
      case "close_input":
        this.textInput = false;
        break;
    }
  }

  current(dom: DomFacts): InputContext {
    if (dom.textFocused || this.textInput) return "text";
    if (!this.inGame) return "lobby";
    if (dom.uiPopups > 0 || dom.legacyMenu) return "menu";
    switch (this.mouseMode) {
      case MouseMode.TARGET:
      case MouseMode.TARGET_DIR:
      case MouseMode.TARGET_PATH:
        return "target";
      case MouseMode.MORE:
        return "more";
      case MouseMode.YESNO:
        return "yesno";
      case MouseMode.PROMPT:
        return "prompt";
      default:
        return "map";
    }
  }
}
