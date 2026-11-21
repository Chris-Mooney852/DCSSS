// Launcher page: lists servers and moves focus with the arrow keys the controller sends.

import { SERVERS } from "../shared/servers";

declare global {
  interface Window {
    deck: { open(url: string): void; quit(): void };
  }
}

const LAST_KEY = "dcss-deck:last-server";

function storageGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storageSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

function open(url: string): void {
  storageSet(LAST_KEY, url);
  window.deck.open(url);
}

const list = document.getElementById("servers")!;
for (const s of SERVERS) {
  const li = document.createElement("li");
  const btn = document.createElement("button");
  btn.className = "server";
  btn.dataset.url = s.url;
  btn.innerHTML = `<span></span><small></small>`;
  btn.querySelector("span")!.textContent = s.name;
  btn.querySelector("small")!.textContent = s.region;
  btn.addEventListener("click", () => open(s.url));
  li.appendChild(btn);
  list.appendChild(li);
}

const customInput = document.getElementById("custom-url") as HTMLInputElement;
document.getElementById("custom")!.addEventListener("submit", (e) => {
  e.preventDefault();
  const url = customInput.value.trim();
  if (/^https?:\/\//.test(url)) open(url);
});
document.getElementById("quit")!.addEventListener("click", () => window.deck.quit());

const focusables = (): HTMLElement[] =>
  Array.from(document.querySelectorAll<HTMLElement>("button, input"));

document.addEventListener("keydown", (e) => {
  const items = focusables();
  const i = items.indexOf(document.activeElement as HTMLElement);
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const step = e.key === "ArrowDown" ? 1 : -1;
    items[(i + step + items.length) % items.length]?.focus();
  }
});

// Start with the last-used server focused.
const last = storageGet(LAST_KEY);
const initial = focusables().find((el) => el.dataset.url === last) ?? focusables()[0];
initial?.focus();
