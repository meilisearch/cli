import { Meilisearch } from "meilisearch";
import { describe, expect, it } from "vitest";
import { MeiliCliError } from "../../src/lib/errors.js";
import { formatDuration, isTaskFailure, parseDuration, waitForTask } from "../../src/lib/tasks.js";
import { ENGINE_URL, engineHandlers, makeTask } from "../helpers/engine-handlers.js";
import { server, useMockServer } from "../helpers/msw.js";

useMockServer();

describe("parseDuration", () => {
  it("accepts ms, s, m and h", () => {
    expect(parseDuration("500ms")).toBe(500);
    expect(parseDuration("30s")).toBe(30_000);
    expect(parseDuration("2m")).toBe(120_000);
    expect(parseDuration("1.5s")).toBe(1500);
    expect(parseDuration("1h")).toBe(3_600_000);
  });

  it("rejects anything else with cli_usage", () => {
    for (const input of ["", "30", "abc", "2 m", "-1s"]) {
      expect(() => parseDuration(input)).toThrow(MeiliCliError);
    }
  });

  it("formats back with the largest exact unit", () => {
    expect(formatDuration(60_000)).toBe("1m");
    expect(formatDuration(30_000)).toBe("30s");
    expect(formatDuration(1500)).toBe("1500ms");
  });
});

describe("isTaskFailure", () => {
  it("is true for failed and canceled only", () => {
    expect(isTaskFailure({ status: "failed" })).toBe(true);
    expect(isTaskFailure({ status: "canceled" })).toBe(true);
    expect(isTaskFailure({ status: "succeeded" })).toBe(false);
    expect(isTaskFailure({ status: "processing" })).toBe(false);
  });
});

describe("waitForTask", () => {
  const client = new Meilisearch({ host: ENGINE_URL });

  it("polls until a final status with a doubling interval capped at one second", async () => {
    server.use(
      engineHandlers.taskSequence(42, [
        makeTask({ uid: 42, status: "enqueued" }),
        makeTask({ uid: 42, status: "processing" }),
        makeTask({ uid: 42, status: "processing" }),
        makeTask({ uid: 42, status: "processing" }),
        makeTask({ uid: 42, status: "succeeded" }),
      ]),
    );
    const sleeps: number[] = [];
    const progress: string[] = [];
    const task = await waitForTask(client, 42, {
      timeoutMs: 60_000,
      onProgress: (current) => progress.push(current.status),
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(task.status).toBe("succeeded");
    expect(progress).toEqual(["enqueued", "processing", "processing", "processing"]);
    expect(sleeps).toEqual([100, 200, 400, 800]);
  });

  it("returns a failed task instead of throwing", async () => {
    server.use(engineHandlers.taskSequence(7, [makeTask({ uid: 7, status: "failed" })]));
    const task = await waitForTask(client, 7, { timeoutMs: 1000 });
    expect(task.status).toBe("failed");
    expect(isTaskFailure(task)).toBe(true);
  });

  it("throws cli_timeout when the deadline passes", async () => {
    server.use(engineHandlers.taskSequence(9, [makeTask({ uid: 9, status: "processing" })]));
    const error = await waitForTask(client, 9, {
      timeoutMs: 1,
      sleep: () => new Promise((resolve) => setTimeout(resolve, 5)),
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(MeiliCliError);
    expect((error as MeiliCliError).code).toBe("cli_timeout");
    expect((error as MeiliCliError).exitCode).toBe(5);
    expect((error as MeiliCliError).message).toContain("Task 9");
    expect((error as MeiliCliError).hint).toBe("Run `meili task get 9` to check its status.");
  });
});
