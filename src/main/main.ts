// Electron main process: one window, a local launcher page, and the webtiles server the
// player picks. Keystrokes from the preload's controller layer are delivered with
// webContents.sendInputEvent, so the page receives trusted, native key events.

import { app, BrowserWindow, ipcMain, shell, type KeyboardInputEvent } from "electron";
import path from "node:path";
import type { KeyStroke } from "../shared/bindings";

const LAUNCHER = path.join(__dirname, "../launcher/index.html");
const PRELOAD = path.join(__dirname, "../preload/preload.js");

/** Steam sets SteamDeck=1 when running on a Deck; --fullscreen forces it elsewhere. */
const fullscreen = process.env.SteamDeck === "1" || process.argv.includes("--fullscreen");

let win: BrowserWindow | null = null;

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    fullscreen,
    backgroundColor: "#000000",
    autoHideMenuBar: true,
    title: "DCSS Deck",
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  // Links that would open a new window go to the system browser instead.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  void win.loadFile(LAUNCHER);
}

function sendKey(stroke: KeyStroke): void {
  const wc = win?.webContents;
  if (!wc) return;
  const modifiers: KeyboardInputEvent["modifiers"] = [];
  if (stroke.shift) modifiers.push("shift");
  if (stroke.ctrl) modifiers.push("control");

  const named = stroke.key.length > 1;
  wc.sendInputEvent({ type: "keyDown", keyCode: stroke.key, modifiers });
  // Chromium only fires `keypress` for an explicit char event. Real keyboards produce one
  // for printable keys and Enter; the webtiles client reads those from keypress.
  if (!stroke.ctrl && (!named || stroke.key === "Enter")) {
    wc.sendInputEvent({ type: "char", keyCode: named ? "\r" : stroke.key, modifiers });
  }
  wc.sendInputEvent({ type: "keyUp", keyCode: stroke.key, modifiers });
}

ipcMain.on("dcss:key", (_e, stroke: KeyStroke) => {
  if (stroke && typeof stroke.key === "string") sendKey(stroke);
});

ipcMain.on("dcss:launcher", () => {
  void win?.loadFile(LAUNCHER);
});

ipcMain.on("dcss:open", (_e, url: unknown) => {
  if (typeof url === "string" && /^https?:\/\//.test(url)) void win?.loadURL(url);
});

ipcMain.on("dcss:quit", () => app.quit());

void app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
