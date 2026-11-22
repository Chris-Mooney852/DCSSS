import { defineConfig } from "vitest/config";

// Unit tests only; the end-to-end suite in e2e/ runs with Playwright.
export default defineConfig({ test: { include: ["test/**/*.test.ts"] } });
