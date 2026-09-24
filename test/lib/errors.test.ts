import { Errors } from "@oclif/core";
import {
  MeilisearchApiError,
  MeilisearchRequestError,
  MeilisearchRequestTimeOutError,
} from "meilisearch";
import { describe, expect, it } from "vitest";
import {
  CLI_ERROR_CODES,
  EXIT_CODES,
  engineExitCode,
  formatError,
  MANAGEMENT_ERROR_CODES,
  MeiliCliError,
  managementErrorCode,
  toRenderedError,
} from "../../src/lib/errors.js";

const apiBody = {
  message: "Index `movies` not found.",
  code: "index_not_found",
  type: "invalid_request",
  link: "https://docs.meilisearch.com/errors#index_not_found",
};

function apiError(status: number, body = apiBody): MeilisearchApiError {
  return new MeilisearchApiError(new Response(null, { status }), body);
}

describe("MeiliCliError", () => {
  it("carries the default exit code of its code", () => {
    for (const [code, exitCode] of Object.entries(CLI_ERROR_CODES)) {
      const error = new MeiliCliError(code as keyof typeof CLI_ERROR_CODES, "message");
      expect(error.exitCode).toBe(exitCode);
      expect(error.toBody()).toEqual({ code, type: "cli", message: "message" });
    }
  });

  it("accepts an explicit exit code and a hint", () => {
    const error = new MeiliCliError("cli_config", "Context `x` not found.", {
      exitCode: EXIT_CODES.notFound,
      hint: "Run `meili context list`.",
    });
    expect(error.exitCode).toBe(4);
    expect(error.toBody().hint).toBe("Run `meili context list`.");
  });
});

describe("toRenderedError", () => {
  it("passes engine API errors through and maps the exit code from the status", () => {
    const notFound = toRenderedError(apiError(404));
    expect(notFound.body).toEqual(apiBody);
    expect(notFound.exitCode).toBe(4);

    const forbidden = toRenderedError(apiError(403));
    expect(forbidden.exitCode).toBe(3);
    expect(forbidden.body.hint).toContain("--api-key");

    expect(toRenderedError(apiError(401)).exitCode).toBe(3);
    expect(toRenderedError(apiError(500)).exitCode).toBe(1);
    expect(toRenderedError(apiError(400)).exitCode).toBe(1);
  });

  it("treats an HTTP error without a Meilisearch body as a connection problem", () => {
    const rendered = toRenderedError(new MeilisearchApiError(new Response(null, { status: 502 })));
    expect(rendered.body.code).toBe("cli_network");
    expect(rendered.body.message).toBe(
      "The server answered HTTP 502 without a Meilisearch error body.",
    );
    expect(rendered.exitCode).toBe(6);
  });

  it("maps a network failure to cli_network and exit 6", () => {
    const cause = new TypeError("fetch failed", {
      cause: new Error("connect ECONNREFUSED ::1:9999"),
    });
    const rendered = toRenderedError(
      new MeilisearchRequestError("http://localhost:9999/health", cause),
    );
    expect(rendered.body).toEqual({
      code: "cli_network",
      type: "cli",
      message: "Cannot connect to http://localhost:9999/health: connect ECONNREFUSED ::1:9999.",
    });
    expect(rendered.exitCode).toBe(6);
  });

  it("maps an HTTP timeout to cli_timeout and exit 5", () => {
    const rendered = toRenderedError(new MeilisearchRequestTimeOutError(1500, {}));
    expect(rendered.body.code).toBe("cli_timeout");
    expect(rendered.body.message).toBe("The HTTP request timed out after 1500 ms.");
    expect(rendered.exitCode).toBe(5);
  });

  it("maps oclif usage errors to cli_usage and exit 2, without the help suffix", () => {
    const rendered = toRenderedError(
      new Errors.CLIError("Unexpected argument: extra\nSee more help with --help"),
    );
    expect(rendered.body.code).toBe("cli_usage");
    expect(rendered.body.message).toBe("Unexpected argument: extra");
    expect(rendered.body.hint).toContain("--help");
    expect(rendered.exitCode).toBe(2);
  });

  it("rewrites oclif's command-not-found message with spaces", () => {
    const rendered = toRenderedError(new Errors.CLIError("command index:lst not found"));
    expect(rendered.body.message).toBe("Command `index lst` not found.");
    expect(rendered.exitCode).toBe(2);
  });

  it("keeps the exit code of an ExitError, which was rendered upstream", () => {
    expect(toRenderedError(new Errors.ExitError(7)).exitCode).toBe(7);
  });

  it("wraps anything else as cli_internal with exit 1", () => {
    const rendered = toRenderedError(new TypeError("boom"));
    expect(rendered.body.code).toBe("cli_internal");
    expect(rendered.body.message).toBe("Unexpected error: boom");
    expect(rendered.exitCode).toBe(1);
    expect(rendered.stack).toContain("TypeError: boom");

    expect(toRenderedError("a string").body.message).toBe("Unexpected error: a string");
  });
});

describe("formatError", () => {
  const rendered = toRenderedError(
    new MeiliCliError("cli_config", "No URL.", { hint: "Set `MEILI_URL`." }),
  );

  it("prints one compact JSON document in json mode", () => {
    expect(formatError(rendered, { mode: "json", pretty: false, debug: false })).toBe(
      '{"error":{"code":"cli_config","type":"cli","message":"No URL.","hint":"Set `MEILI_URL`."}}\n',
    );
  });

  it("indents the JSON when asked", () => {
    const out = formatError(rendered, { mode: "ndjson", pretty: true, debug: false });
    expect(out).toBe(`${JSON.stringify({ error: rendered.body }, null, 2)}\n`);
  });

  it("prints a short text starting with the code in table mode", () => {
    expect(formatError(rendered, { mode: "table", pretty: false, debug: false })).toBe(
      "cli_config: No URL.\nSet `MEILI_URL`.\n",
    );
  });

  it("appends the stack only with debug", () => {
    expect(formatError(rendered, { mode: "json", pretty: false, debug: false })).not.toContain(
      "MeiliCliError",
    );
    expect(formatError(rendered, { mode: "json", pretty: false, debug: true })).toContain("at ");
  });
});

describe("code tables", () => {
  it("maps management API statuses to codes and exit codes", () => {
    expect(managementErrorCode(401)).toBe("management_unauthorized");
    expect(managementErrorCode(403)).toBe("management_forbidden");
    expect(managementErrorCode(404)).toBe("management_not_found");
    expect(managementErrorCode(422)).toBe("management_unprocessable");
    expect(managementErrorCode(500)).toBe("management_error");
    expect(MANAGEMENT_ERROR_CODES.management_unauthorized).toBe(3);
    expect(MANAGEMENT_ERROR_CODES.management_not_found).toBe(4);
  });

  it("maps engine statuses to exit codes", () => {
    expect(engineExitCode(401)).toBe(3);
    expect(engineExitCode(403)).toBe(3);
    expect(engineExitCode(404)).toBe(4);
    expect(engineExitCode(409)).toBe(1);
  });
});
