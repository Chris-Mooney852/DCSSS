// Launcher page: offline play, the public server list, and error reports. Focus moves with
// the arrow keys the controller sends; A (Enter) activates the focused button.

import type { DeckApi } from "../shared/ipc";
import { SERVERS } from "../shared/servers";

declare global {
  interface Window {
    deck: DeckApi;
  }
}

const LAST_KEY = "dcss-deck:last-choice";
const OFFLINE = "offline";

function storageGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storageSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

function showError(message: string, log: string[], dataDir: string): void {
  $("error").hidden = false;
  $("error-message").textContent = message;
  $("error-log").textContent = log.length ? log.join("\n") : "(no output)";
  $("data-dir").textContent = dataDir;
}

function openOnline(url: string): void {
  storageSet(LAST_KEY, url);
  window.deck.open(url);
}

// Online servers.
const list = $("servers");
for (const s of SERVERS) {
  const li = document.createElement("li");
  const btn = document.createElement("button");
  btn.className = "server";
  btn.dataset.choice = s.url;
  btn.innerHTML = `<span></span><small></small>`;
  btn.querySelector("span")!.textContent = s.name;
  btn.querySelector("small")!.textContent = s.region;
  btn.addEventListener("click", () => openOnline(s.url));
  li.appendChild(btn);
  list.appendChild(li);
}

const customInput = $<HTMLInputElement>("custom-url");
$("custom").addEventListener("submit", (e) => {
  e.preventDefault();
  const url = customInput.value.trim();
  if (/^https?:\/\//.test(url)) openOnline(url);
});
$("quit").addEventListener("click", () => window.deck.quit());

// Offline play.
const playOffline = $<HTMLButtonElement>("play-offline");
playOffline.dataset.choice = OFFLINE;
let dataDir = "";
playOffline.addEventListener("click", async () => {
  if (playOffline.disabled) return;
  storageSet(LAST_KEY, OFFLINE);
  playOffline.disabled = true;
  $("offline-status").textContent = "Starting…";
  $("error").hidden = true;
  const result = await window.deck.playOffline();
  if (!result.ok) {
    playOffline.disabled = false;
    $("offline-status").textContent = "Try again";
    showError(result.message, result.log, dataDir);
    playOffline.focus();
  }
  // On success the main process navigates away from this page.
});

const focusables = (): HTMLElement[] =>
  Array.from(document.querySelectorAll<HTMLElement>("button, input, summary"))
    .filter((el) => el.offsetParent !== null);

document.addEventListener("keydown", (e) => {
  const items = focusables();
  const i = items.indexOf(document.activeElement as HTMLElement);
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const step = e.key === "ArrowDown" ? 1 : -1;
    items[(i + step + items.length) % items.length]?.focus();
  }
});

async function init(): Promise<void> {
  const info = await window.deck.info();
  dataDir = info.dataDir;
  if (info.offline.available) {
    $("offline-section").hidden = false;
    $("offline-version").textContent = info.offline.version;
  }
  if (info.error) showError(info.error.message, info.error.log, info.dataDir);

  // Focus the last choice, else offline play, else the first server.
  const last = storageGet(LAST_KEY);
  const items = focusables();
  const initial = items.find((el) => el.dataset.choice === last) ??
    (info.offline.available ? playOffline : items[0]);
  initial?.focus();
}

void init();
