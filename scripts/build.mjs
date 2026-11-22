// Bundles the main process, the preload script and the launcher page with esbuild.
// The preload runs sandboxed, so it must be a single self-contained file.
import { build } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";

const common = { bundle: true, sourcemap: true, logLevel: "info", external: ["electron"] };

await Promise.all([
  build({ ...common, entryPoints: ["src/main/main.ts"], outfile: "dist/main/main.js", platform: "node", format: "cjs", target: "node20" }),
  build({ ...common, entryPoints: ["src/preload/preload.ts"], outfile: "dist/preload/preload.js", platform: "node", format: "cjs", target: "chrome128" }),
  build({ ...common, entryPoints: ["src/launcher/launcher.ts"], outfile: "dist/launcher/launcher.js", platform: "browser", format: "iife", target: "chrome128" }),
]);

mkdirSync("dist/launcher", { recursive: true });
cpSync("src/launcher/index.html", "dist/launcher/index.html");
cpSync("src/launcher/launcher.css", "dist/launcher/launcher.css");
