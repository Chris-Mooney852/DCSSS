// Launches the real app with a fresh profile and data dir, and drives it with a
// simulated gamepad (see "dcss:simulated-pad" in src/preload/preload.ts).

import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Btn, type ButtonName } from "../src/shared/bindings";

const ROOT = path.resolve(__dirname, "..");

/** Prefer the packaged bundle (what ships), fall back to the dev build. */
function offlineEnv(): Record<string, string> {
  const bundle = path.join(ROOT, "bundle");
  if (fs.existsSync(path.join(bundle, "crawl", "crawl"))) {
    return {
      DCSS_DECK_CRAWL_DIR: path.join(bundle, "crawl"),
      DCSS_DECK_PYTHON: path.join(bundle, "python", "bin", "python3"),
    };
  }
  return {}; // src/main/paths.ts finds build/ and build/venv
}

export function offlineAvailable(): boolean {
  return fs.existsSync(path.join(ROOT, "bundle", "crawl", "crawl")) ||
    fs.existsSync(path.join(ROOT, "build", "crawl-0.34.1", "crawl-ref", "source", "crawl"));
}

export interface Deck {
  app: ElectronApplication;
  page: Page;
  dataDir: string;
  pad: Pad;
  context(): Promise<string>;
  close(): Promise<void>;
}

export async function launch(): Promise<Deck> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dcss-deck-e2e-"));
  const dataDir = path.join(tmp, "data");
  const app = await electron.launch({
    args: [ROOT, "--no-sandbox"],
    env: {
      ...process.env as Record<string, string>,
      ...offlineEnv(),
      DCSS_DECK_DATA_DIR: dataDir,
      DCSS_DECK_USER_DATA_DIR: path.join(tmp, "profile"),
    },
  });
  const page = await app.firstWindow();
  const pad = new Pad(app);
  return {
    app, page, dataDir, pad,
    // "" while the page is between loads (evaluate throws during navigation).
    context: () => page.evaluate(() => document.documentElement.dataset.deckContext ?? "").catch(() => ""),
    async close() {
      await app.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    },
  };
}

type Stick = [number, number];

/** A simulated Xbox-style pad. Frames run at the display refresh rate, so hold for ~100 ms. */
export class Pad {
  private buttons = new Set<number>();
  private stick: Stick = [0, 0];

  constructor(private readonly app: ElectronApplication) {}

  private async send(): Promise<void> {
    const snapshot = {
      buttons: Array.from({ length: 17 }, (_, i) => this.buttons.has(i)),
      axes: [this.stick[0], this.stick[1], 0, 0],
    };
    await this.app.evaluate(({ BrowserWindow }, s) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send("dcss:simulated-pad", s);
    }, snapshot);
  }

  async hold(...names: ButtonName[]): Promise<void> {
    for (const n of names) this.buttons.add(Btn[n]);
    await this.send();
  }

  async release(...names: ButtonName[]): Promise<void> {
    for (const n of names) this.buttons.delete(Btn[n]);
    await this.send();
  }

  async aim(x: number, y: number): Promise<void> {
    this.stick = [x, y];
    await this.send();
  }

  /** Press and release buttons together, like a quick tap (combos included). */
  async press(...names: ButtonName[]): Promise<void> {
    await this.hold(...names);
    await sleep(120);
    await this.release(...names);
    await sleep(120);
  }

  async reset(): Promise<void> {
    this.buttons.clear();
    this.stick = [0, 0];
    await this.send();
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
