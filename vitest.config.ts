import { defineConfig } from "vitest/config";

// Deterministic help snapshots: fixed terminal width, no colors.
const env = {
  OCLIF_COLUMNS: "80",
  FORCE_COLOR: "0",
  NO_COLOR: "1",
};

export default defineConfig({
  test: {
    env,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["test/commands/**/*.test.ts", "test/lib/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "contract",
          include: ["test/contract/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration-engine",
          include: ["test/integration/engine/**/*.test.ts"],
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
