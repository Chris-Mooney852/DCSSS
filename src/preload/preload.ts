// Runs in every page the app loads (launcher and webtiles servers). Polls the gamepad,
// works out what the game wants, and asks the main process to send real key events.

import { contextBridge, ipcRenderer, webFrame } from "electron";
import { ContextTracker, type DomFacts, type ProtocolMessage } from "../shared/context";
import { Controller, type PadSnapshot } from "../shared/controller";
import { Overlay } from "./overlay";
import { HOOK_TAG, PAGE_HOOK_SOURCE } from "./page-hook";

const isLauncher = location.protocol === "file:";

if (isLauncher) {
  // Only the local launcher page gets an API; remote server pages get nothing.
  contextBridge.exposeInMainWorld("deck", {
    open: (url: string) => ipcRenderer.send("dcss:open", url),
    quit: () => ipcRenderer.send("dcss:quit"),
  });
} else {
  void webFrame.executeJavaScript(PAGE_HOOK_SOURCE);
}

const tracker = new ContextTracker();
const controller = new Controller();
const overlay = new Overlay();

window.addEventListener("message", (e) => {
  if (e.source !== window) return;
  const data = e.data as { [HOOK_TAG]?: boolean; message?: ProtocolMessage } | null;
  if (data && data[HOOK_TAG] && data.message) tracker.handle(data.message);
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
  return { uiPopups, legacyMenu, textFocused };
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
  if (pad) {
    const context = isLauncher ? "lobby" : tracker.current(domFacts());
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
