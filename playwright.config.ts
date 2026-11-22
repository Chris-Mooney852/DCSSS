import { defineConfig } from "@playwright/test";

// End-to-end tests drive the real app against the real (bundled) DCSS server.
// Run with `npm run test:e2e`; needs a display (CI uses xvfb-run).
export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { trace: "off" },
});
