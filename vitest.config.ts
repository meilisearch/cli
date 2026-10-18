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
          name: "integration-meilisearch",
          include: ["test/integration/meilisearch/**/*.test.ts"],
          testTimeout: 30_000,
          hookTimeout: 60_000,
          // One Meilisearch for every file: a global list route, `GET /indexes`,
          // cannot be scoped to the fixtures of one file, so paginating it while
          // another file creates or deletes its own indexes skips entries.
          fileParallelism: false,
        },
      },
    ],
  },
});
