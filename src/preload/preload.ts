// Runs in every page the app loads (launcher and webtiles servers). Polls the gamepad,
// works out what the game wants, and asks the main process to send real key events.

import { contextBridge, ipcRenderer, webFrame } from "electron";
import { ContextTracker, type DomFacts, type ProtocolMessage } from "../shared/context";
import { Controller, type PadSnapshot } from "../shared/controller";
import type { DeckApi } from "../shared/ipc";
import { Overlay } from "./overlay";
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

window.addEventListener("message", (e) => {
  if (e.source !== window) return;
  const data = e.data as { [HOOK_TAG]?: boolean; message?: ProtocolMessage } | null;
  if (!data || !data[HOOK_TAG] || !data.message) return;
  tracker.handle(data.message);
  // The main process decides what to do (offline: back to the launcher).
  if (data.message.msg === "game_ended") ipcRenderer.send("dcss:game-ended");
});

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

function readPad(): PadSnapshot | null {
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
      if (action.type === "key") ipcRenderer.send("dcss:key", action.stroke);
      else ipcRenderer.send("dcss:launcher");
    }
    if (!isLauncher) overlay.update(context, result.aimed, result.altLayer);
  }
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
