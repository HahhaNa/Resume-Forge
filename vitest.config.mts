import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Tests cover `lib/` — the pure half of the app: LaTeX generation, résumé import,
 * date formatting, variant rules, schema migration. None of it touches the DOM, so
 * the node environment is enough and there is no jsdom in the dependency tree.
 *
 * What is deliberately not covered: React components and the zustand store's
 * wiring. They change shape often, they are cheap to check by opening the app, and
 * testing them would cost more than it catches. The functions here are the opposite
 * — they are what silently corrupts a résumé when they break.
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
