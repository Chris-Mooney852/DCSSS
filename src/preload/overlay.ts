// On-screen HUD: an 8-way compass showing the aimed direction, the current context, and
// hints for the buttons that do something right now. Lives in a shadow root so the
// page's CSS can't touch it.

import { LAYERS, type Layer } from "../shared/bindings";
import type { InputContext } from "../shared/context";
import type { Direction } from "../shared/stick";

const CSS = `
  :host { all: initial; }
  .hud { position: fixed; right: 12px; bottom: 12px; z-index: 2147483647; pointer-events: none;
    display: flex; gap: 10px; align-items: flex-end; font: 13px/1.3 system-ui, sans-serif; color: #eee; }
  .panel { background: rgba(10, 10, 14, 0.78); border: 1px solid #555; border-radius: 8px; padding: 6px 8px; }
  .compass { display: grid; grid-template-columns: repeat(3, 18px); grid-template-rows: repeat(3, 18px); gap: 2px; }
  .compass div { border-radius: 3px; background: #333; }
  .compass .c { background: #666; }
  .compass .on { background: #e8b84a; box-shadow: 0 0 6px #e8b84a; }
  .ctx { font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: #e8b84a; margin-bottom: 2px; }
  .alt { color: #7fc4ff; }
  .hints { display: grid; grid-template-columns: auto auto; column-gap: 8px; row-gap: 1px; }
  .hints b { color: #aaa; font-weight: 600; text-align: right; }
  .hidden { display: none; }
`;

const CELLS: (Direction | "C")[] = ["NW", "N", "NE", "W", "C", "E", "SW", "S", "SE"];
const BUTTON_LABELS: Record<string, string> = {
  A: "A", B: "B", X: "X", Y: "Y", LB: "LB", RB: "RB", LT: "LT", RT: "RT",
  Back: "View", Start: "Menu", LS: "L3", RS: "R3", Up: "D↑", Down: "D↓", Left: "D←", Right: "D→",
};

export class Overlay {
  private root: ShadowRoot | null = null;
  private cells = new Map<string, HTMLElement>();
  private ctxEl!: HTMLElement;
  private hintsEl!: HTMLElement;
  private compassPanel!: HTMLElement;
  private lastKey = "";

  mount(): void {
    if (this.root || !document.body) return;
    const host = document.createElement("div");
    host.id = "dcss-deck-overlay";
    document.body.appendChild(host);
    this.root = host.attachShadow({ mode: "closed" });
    this.root.innerHTML = `<style>${CSS}</style>
      <div class="hud">
        <div class="panel"><div class="ctx"></div><div class="hints"></div></div>
        <div class="panel compass-panel"><div class="compass">
          ${CELLS.map((c) => `<div data-d="${c}" class="${c === "C" ? "c" : ""}"></div>`).join("")}
        </div></div>
      </div>`;
    for (const el of this.root.querySelectorAll<HTMLElement>("[data-d]")) this.cells.set(el.dataset.d!, el);
    this.ctxEl = this.root.querySelector(".ctx")!;
    this.hintsEl = this.root.querySelector(".hints")!;
    this.compassPanel = this.root.querySelector(".compass-panel")!;
  }

  update(context: InputContext, aimed: Direction | null, alt: boolean): void {
    this.mount();
    if (!this.root) return;
    const key = `${context}|${aimed}|${alt}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    for (const [d, el] of this.cells) el.classList.toggle("on", d === aimed);
    this.compassPanel.classList.toggle("hidden", context !== "map");

    this.ctxEl.textContent = alt ? `${context} · LT layer` : context;
    this.ctxEl.classList.toggle("alt", alt);

    const layers = LAYERS[context];
    const layer: Layer = alt && layers.alt ? layers.alt : layers.base;
    const rows: [string, string][] = [];
    if (context === "map" && !alt) rows.push(["L+A", "Move"], ["L+RT+A", "Run"]);
    if (context === "target") rows.push(["L", "Move cursor"]);
    if (context === "text") rows.push(["Steam+X", "Keyboard"]);
    for (const [btn, binding] of Object.entries(layer)) {
      if (binding) rows.push([BUTTON_LABELS[btn] ?? btn, binding.label]);
    }
    if (context === "map" && !alt && layers.alt) rows.push(["LT", "More actions"]);
    this.hintsEl.innerHTML = rows.map(([b, l]) => `<b>${b}</b><span>${escapeHtml(l)}</span>`).join("");
  }

  setVisible(visible: boolean): void {
    const host = document.getElementById("dcss-deck-overlay");
    if (host) host.style.display = visible ? "" : "none";
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
