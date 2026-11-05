/**
 * `--help` never calls an API and documents every environment
 * variable but the development ones, which CONTRIBUTING.md documents.
 */
import { describe, expect, it } from "vitest";
import { ENV_VARS } from "../../src/lib/config.js";
import { countRequests, useMockServer } from "../helpers/msw.js";
import { runCli } from "../helpers/run-command.js";
import { codeSpans, readDoc, section, tableRows } from "./markdown.js";

useMockServer();

const documented = tableRows(
  section(readDoc("docs/contract/config.md"), "Environment variables"),
).map((row) => codeSpans(row[0] ?? "")[0] ?? "");

describe("--help", () => {
  it("makes no network call, even with --project-url", async () => {
    for (const argv of [
      ["--help"],
      ["index", "--help"],
      ["health", "--help"],
      ["schema", "--help"],
    ]) {
      let result: Awaited<ReturnType<typeof runCli>> | undefined;
      const requests = await countRequests(async () => {
        result = await runCli([...argv, "--project-url", "http://meili.test:7700"]);
      });
      expect(requests, argv.join(" ")).toBe(0);
      expect(result?.exitCode, argv.join(" ")).toBe(0);
      expect(result?.stdout.length, argv.join(" ")).toBeGreaterThan(0);
    }
  });

  it("lays out a topic: the usage, the global flags, then the commands", async () => {
    const result = await runCli(["index", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatchSnapshot();
  });

  it("lays out the root help: the resources by API, then the global flags and the variables", async () => {
    const result = await runCli(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatchSnapshot();
  });

  it("documents the variables of config.md in the root help, and the development ones in CONTRIBUTING.md", async () => {
    const result = await runCli(["--help"]);
    const contributing = readDoc("CONTRIBUTING.md");
    expect(ENV_VARS.map((variable) => variable.name)).toEqual(documented);
    for (const { name, development } of ENV_VARS) {
      // config.md says which ones: the `MEILI_MANAGEMENT_*` variables.
      expect(development === true, name).toBe(name.startsWith("MEILI_MANAGEMENT_"));
      if (development) {
        expect(result.stdout, name).not.toContain(name);
        expect(contributing, name).toContain(`\`${name}\``);
      } else {
        expect(result.stdout, name).toContain(name);
      }
    }
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
