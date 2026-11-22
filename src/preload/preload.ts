// Runs in every page the app loads (launcher and webtiles servers). Polls the gamepad,
// works out what the game wants, and asks the main process to send real key events.

import { contextBridge, ipcRenderer, webFrame } from "electron";
import { ContextTracker, type DomFacts, type ProtocolMessage } from "../shared/context";
import { Controller, type PadSnapshot } from "../shared/controller";
import type { DeckApi } from "../shared/ipc";
import type { KeyStroke } from "../shared/bindings";
import { Overlay } from "./overlay";
import { RadialManager } from "./radial-manager";
import { HOOK_TAG, PAGE_HOOK_SOURCE } from "./page-hook";

const isLauncher = location.protocol === "file:";

if (isLauncher) {
  // Only the local launcher page gets an API; remote server pages get nothing.
  const api: DeckApi = {
    info: () => ipcRenderer.invoke("dcss:info"),
    playOffline: () => ipcRenderer.invoke("dcss:play-offline"),
    open: (url: string) => ipcRenderer.send("dcss:open", url),
    quit: () => ipcRenderer.send("dcss:quit"),
  };
  contextBridge.exposeInMainWorld("deck", api);
} else {
  void webFrame.executeJavaScript(PAGE_HOOK_SOURCE);
}

const tracker = new ContextTracker();
const controller = new Controller();
const overlay = new Overlay();

const sendKeys = (keys: KeyStroke[]) => keys.forEach((k) => ipcRenderer.send("dcss:key", k));

// Requests to the page hook (see page-hook.ts), answered by postMessage.
let nextRequestId = 1;
const pending = new Map<number, (data: unknown) => void>();
function request(type: string, extra: Record<string, unknown> = {}): Promise<unknown> {
  const id = nextRequestId++;
  return new Promise((resolve) => {
    const timer = setTimeout(() => { pending.delete(id); resolve(null); }, 1000);
    pending.set(id, (data) => { clearTimeout(timer); resolve(data); });
    window.postMessage({ [`${HOOK_TAG}Request`]: { type, id, ...extra } }, "*");
  });
}

const radials = new RadialManager({
  sendKeys,
  request,
  context: () => tracker.current(domFacts()),
});

window.addEventListener("message", (e) => {
  if (e.source !== window) return;
  const data = e.data as { [HOOK_TAG]?: boolean; message?: ProtocolMessage; reply?: string; id?: number; data?: unknown } | null;
  if (!data || !data[HOOK_TAG]) return;
  if (data.reply !== undefined) {
    pending.get(data.id ?? -1)?.(data.data);
    pending.delete(data.id ?? -1);
    return;
  }
  if (!data.message) return;
  tracker.handle(data.message);
  radials.onProtocol(data.message);
  // The main process decides what to do (offline: back to the launcher).
  if (data.message.msg === "game_ended") ipcRenderer.send("dcss:game-ended");
});

// While a radial reads a game menu (spells, abilities), hide that menu underneath.
if (!isLauncher) {
  const style = document.createElement("style");
  style.textContent = "html.deck-radial-open #ui-stack, html.deck-radial-open #menu { visibility: hidden !important; }";
  document.addEventListener("DOMContentLoaded", () => document.head.appendChild(style));
}

function domFacts(): DomFacts {
  const stack = document.getElementById("ui-stack");
  const uiPopups = stack
    ? Array.from(stack.children).filter((c) => !c.classList.contains("hidden")).length
    : 0;
  const menu = document.getElementById("menu");
  const legacyMenu = !!menu && menu.offsetParent !== null;
  const active = document.activeElement;
  const textFocused =
    active instanceof HTMLTextAreaElement ||
    (active instanceof HTMLInputElement && !["button", "checkbox", "radio", "submit"].includes(active.type));
  // The client shows one layer at a time: #lobby, #loader, or a game layer (#normal, #crt).
  const lobbyVisible = ["lobby", "loader"].some((id) => {
    const el = document.getElementById(id);
    return !!el && el.offsetParent !== null;
  });
  return { lobbyVisible, uiPopups, legacyMenu, textFocused };
}

// A simulated pad, used by the end-to-end tests. Only the main process can send this
// (webContents.send); web pages have no way to reach it.
let simulatedPad: PadSnapshot | null = null;
ipcRenderer.on("dcss:simulated-pad", (_e, pad: PadSnapshot | null) => {
  simulatedPad = pad;
});

function readPad(): PadSnapshot | null {
  if (simulatedPad) return simulatedPad;
  // Use the first connected pad. Under Steam Input this is Steam's virtual controller.
  for (const pad of navigator.getGamepads()) {
    if (pad && pad.connected) {
      return { buttons: pad.buttons.map((b) => b.pressed), axes: pad.axes };
    }
  }
  return null;
}

function tick(now: number): void {
  const pad = readPad();
  const context = isLauncher ? "lobby" : tracker.current(domFacts());
  // Exposed for end-to-end tests and debugging (visible in devtools).
  if (document.documentElement.dataset.deckContext !== context) {
    document.documentElement.dataset.deckContext = context;
  }
  if (pad) {
    const result = controller.frame(pad, context, now);
    for (const action of result.actions) {
      switch (action.type) {
        case "key": ipcRenderer.send("dcss:key", action.stroke); break;
        case "launcher": ipcRenderer.send("dcss:launcher"); break;
        case "radial-open": void radials.open(action.kind); break;
        case "radial-point": radials.point(action.dir); break;
        case "radial-page": radials.turnPage(action.delta); break;
        case "radial-confirm": radials.confirm(); break;
        case "radial-cancel": radials.cancel(); break;
      }
    }
    if (!isLauncher) {
      overlay.update(context, result.aimed, result.altLayer);
      overlay.renderRadial(radials.view);
    }
  }
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
