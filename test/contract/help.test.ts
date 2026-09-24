/** `--help` never opens a network connection and documents every environment variable. */
import { describe, expect, it } from "vitest";
import { countRequests, useMockServer } from "../helpers/msw.js";
import { runCli } from "../helpers/run-command.js";
import { codeSpans, readDoc, section, tableRows } from "./markdown.js";

useMockServer();

const documented = tableRows(
  section(readDoc("docs/contract/config.md"), "Environment variables"),
).map((row) => codeSpans(row[0] ?? "")[0] ?? "");

describe("--help", () => {
  it("makes no network call, even with a URL configured", async () => {
    for (const argv of [["--help"], ["health", "--help"]]) {
      let result: Awaited<ReturnType<typeof runCli>> | undefined;
      const requests = await countRequests(async () => {
        result = await runCli(argv, { env: { MEILI_URL: "http://meili.test:7700" } });
      });
      expect(requests, argv.join(" ")).toBe(0);
      expect(result?.exitCode, argv.join(" ")).toBe(0);
      expect(result?.stdout.length, argv.join(" ")).toBeGreaterThan(0);
    }
  });

  it("documents every environment variable of config.md in the root help", async () => {
    const result = await runCli(["--help"]);
    expect(result.stdout).toContain("ENVIRONMENT VARIABLES");
    for (const name of documented) expect(result.stdout).toContain(name);
  });

  it("prints the version without a network call", async () => {
    let result: Awaited<ReturnType<typeof runCli>> | undefined;
    const requests = await countRequests(async () => {
      result = await runCli(["--version"]);
    });
    expect(requests).toBe(0);
    expect(result?.stdout).toMatch(/^@meilisearch\/cli\/\d+\.\d+\.\d+ /);
  });
});
