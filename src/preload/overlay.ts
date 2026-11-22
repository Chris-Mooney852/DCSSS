// On-screen HUD: an 8-way compass showing the aimed direction, the current context, and
// hints for the buttons that do something right now. Lives in a shadow root so the
// page's CSS can't touch it.

import { LAYERS, type Layer } from "../shared/bindings";
import { RADIAL_TITLES } from "../shared/radial";
import type { RadialView } from "./radial-manager";
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

  .radial { position: fixed; left: 50%; top: 50%; width: 460px; height: 460px; margin: -230px 0 0 -230px;
    z-index: 2147483647; pointer-events: none; font: 14px/1.25 system-ui, sans-serif; color: #eee; }
  .radial-ring { position: absolute; inset: 40px; border-radius: 50%; background: rgba(10, 10, 14, 0.82);
    border: 2px solid #555; box-shadow: 0 8px 40px rgba(0,0,0,.6); }
  .radial-center { position: absolute; left: 50%; top: 50%; width: 170px; margin-left: -85px;
    transform: translateY(-50%); text-align: center; }
  .radial-title { color: #e8b84a; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
  .radial-current { margin: 6px 0; font-size: 15px; min-height: 2.5em; }
  .radial-help { color: #999; font-size: 12px; }
  .slot { position: absolute; width: 132px; margin: -24px 0 0 -66px; padding: 5px 7px; text-align: center;
    border-radius: 8px; background: #1b1b24; border: 2px solid #3a3a46; }
  .slot .label { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .slot .detail { color: #aaa; font-size: 12px; }
  .slot.dim { opacity: .5; }
  .slot.on { border-color: #e8b84a; background: #2e2616; box-shadow: 0 0 10px #e8b84a88; opacity: 1; }
`;

/** Slot centres around the ring, clockwise from the top (radius 170 in a 460 box). */
const SLOT_XY = Array.from({ length: 8 }, (_, i) => {
  const a = (i * Math.PI) / 4;
  return [230 + 170 * Math.sin(a), 230 - 170 * Math.cos(a)] as const;
});

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
  private radialEl!: HTMLElement;
  private host!: HTMLElement;
  private lastKey = "";
  private lastRadialKey = "";

  mount(): void {
    if (this.root || !document.body) return;
    const host = document.createElement("div");
    host.id = "dcss-deck-overlay";
    document.body.appendChild(host);
    this.host = host;
    this.root = host.attachShadow({ mode: "closed" });
    this.root.innerHTML = `<style>${CSS}</style>
      <div class="hud">
        <div class="panel"><div class="ctx"></div><div class="hints"></div></div>
        <div class="panel compass-panel"><div class="compass">
          ${CELLS.map((c) => `<div data-d="${c}" class="${c === "C" ? "c" : ""}"></div>`).join("")}
        </div></div>
      </div>
      <div class="radial hidden"></div>`;
    for (const el of this.root.querySelectorAll<HTMLElement>("[data-d]")) this.cells.set(el.dataset.d!, el);
    this.ctxEl = this.root.querySelector(".ctx")!;
    this.hintsEl = this.root.querySelector(".hints")!;
    this.compassPanel = this.root.querySelector(".compass-panel")!;
    this.radialEl = this.root.querySelector(".radial")!;
  }

  /** Draws the open radial, or hides it. Also mirrored on the host element for tests. */
  renderRadial(view: RadialView | null): void {
    this.mount();
    if (!this.root) return;
    const st = view?.state;
    const key = st ? `${st.kind}|${st.page}|${st.slot}|${view.loading}|${st.entries.length}` : "";
    if (key === this.lastRadialKey) return;
    this.lastRadialKey = key;

    this.radialEl.classList.toggle("hidden", !st);
    // The corner hints describe the screen underneath, which a radial replaces.
    this.root.querySelector(".hud")?.classList.toggle("hidden", !!st);
    this.host.dataset.radial = st?.kind ?? "";
    this.host.dataset.radialEntries = st ? String(st.entries.length) : "";
    this.host.dataset.radialSelected = st?.selected()?.label ?? "";
    if (!st) {
      this.radialEl.innerHTML = "";
      return;
    }

    const selected = st.selected();
    const slots = st.visible().map(({ entry, slot }) => {
      const [x, y] = SLOT_XY[slot]!;
      const cls = ["slot", entry.dim ? "dim" : "", slot === st.slot ? "on" : ""].join(" ");
      return `<div class="${cls}" style="left:${x}px;top:${y}px">
        <div class="label">${escapeHtml(entry.label)}</div>
        ${entry.detail ? `<div class="detail">${escapeHtml(entry.detail)}</div>` : ""}</div>`;
    }).join("");
    const current = view.loading ? "Loading…"
      : st.entries.length === 0 ? `No ${RADIAL_TITLES[st.kind].toLowerCase()}`
      : selected ? escapeHtml(selected.label) : "Point with the left stick";
    const page = st.pageCount > 1 ? ` · ${st.page + 1}/${st.pageCount}` : "";
    this.radialEl.innerHTML = `<div class="radial-ring"></div>${slots}
      <div class="radial-center">
        <div class="radial-title">${RADIAL_TITLES[st.kind]}${page}</div>
        <div class="radial-current">${current}</div>
        <div class="radial-help">Release to use · B cancel${st.pageCount > 1 ? "<br>D-pad ← → page" : ""}</div>
      </div>`;
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
      if (!binding) continue;
      const label = binding.radial && !alt ? `${binding.label} · hold: ${RADIAL_TITLES[binding.radial]}` : binding.label;
      rows.push([BUTTON_LABELS[btn] ?? btn, label]);
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
