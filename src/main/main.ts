// Electron main process: one window, a local launcher page, and the game, which is either
// the bundled offline server or a public webtiles server. Keystrokes from the preload's
// controller layer are delivered with webContents.sendInputEvent, so the page receives
// trusted, native key events.

import { app, BrowserWindow, ipcMain, shell, type IpcMainEvent, type KeyboardInputEvent } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { KeyStroke } from "../shared/bindings";
import type { LauncherInfo, PlayResult } from "../shared/ipc";
import { LocalServer, ServerError } from "./local-server";
import { offlinePaths } from "./paths";

const LAUNCHER = path.join(__dirname, "../launcher/index.html");
const PRELOAD = path.join(__dirname, "../preload/preload.js");

/** Steam sets SteamDeck=1 when running on a Deck; --fullscreen forces it elsewhere. */
const fullscreen = process.env.SteamDeck === "1" || process.argv.includes("--fullscreen");

// Lets tests (and side-by-side installs) use their own browser profile.
if (process.env.DCSS_DECK_USER_DATA_DIR) app.setPath("userData", process.env.DCSS_DECK_USER_DATA_DIR);

const paths = offlinePaths({
  packaged: app.isPackaged,
  resourcesPath: process.resourcesPath,
  appPath: app.getAppPath(),
});
const server = new LocalServer(paths);

let win: BrowserWindow | null = null;
/** Shown on the launcher after the offline server fails or crashes. */
let lastError: { message: string; log: string[] } | null = null;

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

  // The webtiles client asks "leave this page?" while a game runs, which would silently
  // block going back to the launcher. Leaving is safe: the server saves the game when
  // the connection closes.
  win.webContents.on("will-prevent-unload", (e) => e.preventDefault());

  showLauncher();
}

function showLauncher(): void {
  void win?.loadFile(LAUNCHER);
}

/** True if the event came from a page served by the offline server. */
function fromLocalServer(e: IpcMainEvent): boolean {
  const base = server.running?.url;
  return !!base && e.senderFrame?.url.startsWith(base) === true;
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

/** Reads the DCSS version from the build without starting it. */
function offlineVersion(): string | null {
  try {
    const h = fs.readFileSync(path.join(paths.crawlDir, "build.h"), "utf8");
    return h.match(/CRAWL_VERSION_SHORT\s+"([^"]+)"/)?.[1] ?? "";
  } catch {
    return null;
  }
}

ipcMain.on("dcss:key", (_e, stroke: KeyStroke) => {
  if (stroke && typeof stroke.key === "string") sendKey(stroke);
});

ipcMain.on("dcss:launcher", () => showLauncher());

ipcMain.on("dcss:open", (_e, url: unknown) => {
  if (typeof url === "string" && /^https?:\/\//.test(url)) void win?.loadURL(url);
});

ipcMain.on("dcss:quit", () => app.quit());

ipcMain.handle("dcss:info", (): LauncherInfo => {
  const version = offlineVersion();
  return {
    offline: { available: version !== null && fs.existsSync(paths.script), version: version ?? "" },
    error: lastError,
    dataDir: paths.dataDir,
  };
});

ipcMain.handle("dcss:play-offline", async (): Promise<PlayResult> => {
  lastError = null;
  try {
    const info = await server.start();
    void win?.loadURL(info.playUrl);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    lastError = { message, log: err instanceof ServerError ? err.log : [] };
    return { ok: false, ...lastError };
  }
});

// After save & quit or death the server shows its own lobby. Offline, there's nothing
// useful there, so go back to the launcher instead.
ipcMain.on("dcss:game-ended", (e) => {
  if (fromLocalServer(e)) showLauncher();
});

server.on("exit", ({ code, signal, log }: { code: number | null; signal: string | null; log: string[] }) => {
  lastError = { message: `The local DCSS server stopped unexpectedly (${signal ?? `exit code ${code}`}).`, log };
  const current = win?.webContents.getURL() ?? "";
  if (!current.startsWith("file:")) showLauncher();
});

let quitting = false;
app.on("before-quit", (e) => {
  if (quitting || !server.running) return;
  // Give the server a moment to save and shut crawl down cleanly.
  e.preventDefault();
  quitting = true;
  void server.stop().finally(() => app.quit());
});

void app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
