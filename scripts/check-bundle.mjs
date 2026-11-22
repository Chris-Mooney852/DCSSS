// Fails `npm run dist` early, with a useful message, if the offline bundle is missing.
import { existsSync } from "node:fs";

const needed = ["bundle/crawl/crawl", "bundle/python/bin/python3", "server/deck_server.py"];
const missing = needed.filter((p) => !existsSync(p));
if (missing.length) {
  console.error(`Offline bundle incomplete, missing: ${missing.join(", ")}`);
  console.error("Build it with: scripts/build-crawl.sh && scripts/bundle-offline.sh");
  console.error("(CI builds it in an ubuntu:22.04 container; see .github/workflows/build.yml)");
  process.exit(1);
}
