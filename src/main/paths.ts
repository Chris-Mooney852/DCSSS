// Where the offline-play pieces live, in a packaged build and in development.
//
// Packaged (AppImage): electron-builder copies them into resources/:
//   resources/crawl/    crawl-ref/source of a WEBTILES=y build (crawl, dat/, webserver/)
//   resources/python/   python-build-standalone with tornado + pyyaml
//   resources/server/   this repo's server/ folder
//
// Development: `npm run setup:offline` builds crawl into build/ and a venv in build/venv.
// Each path can be overridden with an environment variable.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface OfflinePaths {
  python: string;
  script: string;
  crawlDir: string;
  dataDir: string;
}

export function offlinePaths(opts: { packaged: boolean; resourcesPath: string; appPath: string }): OfflinePaths {
  const env = process.env;
  const dataHome = env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
  const dataDir = env.DCSS_DECK_DATA_DIR || path.join(dataHome, "dcss-deck");

  if (opts.packaged) {
    const res = opts.resourcesPath;
    return {
      python: env.DCSS_DECK_PYTHON || path.join(res, "python", "bin", "python3"),
      script: env.DCSS_DECK_SERVER_SCRIPT || path.join(res, "server", "deck_server.py"),
      crawlDir: env.DCSS_DECK_CRAWL_DIR || path.join(res, "crawl"),
      dataDir,
    };
  }

  const root = opts.appPath;
  const venvPython = path.join(root, "build", "venv", "bin", "python");
  return {
    python: env.DCSS_DECK_PYTHON || (fs.existsSync(venvPython) ? venvPython : "python3"),
    script: env.DCSS_DECK_SERVER_SCRIPT || path.join(root, "server", "deck_server.py"),
    crawlDir: env.DCSS_DECK_CRAWL_DIR || path.join(root, "build", "crawl-0.34.1", "crawl-ref", "source"),
    dataDir,
  };
}
