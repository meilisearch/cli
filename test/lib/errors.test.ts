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
  formatError,
  MANAGEMENT_ERROR_CODES,
  ManagementApiError,
  MeiliCliError,
  managementErrorCode,
  meilisearchExitCode,
  toRenderedError,
} from "../../src/lib/errors.js";

describe("ManagementApiError", () => {
  it("takes the API's error field, else the document's description, else the status", () => {
    const rendered = toRenderedError(
      new ManagementApiError(
        403,
        { error: "Forbidden" },
        "team not accessible",
        "POST https://m/api/v2/projects",
      ),
    );
    expect(rendered.body).toEqual({
      code: "management_forbidden",
      type: "management",
      message: "Forbidden",
    });
    expect(rendered.exitCode).toBe(3);
    expect(
      toRenderedError(
        new ManagementApiError(
          422,
          { errors: {} },
          "invalid project attributes",
          "POST https://m/api/v2/projects",
        ),
      ).body.message,
    ).toBe("invalid project attributes");
    expect(
      toRenderedError(
        new ManagementApiError(500, undefined, undefined, "POST https://m/api/v2/projects"),
      ).body,
    ).toEqual({
      code: "management_error",
      type: "management",
      message: "The Management API answered HTTP 500 to POST https://m/api/v2/projects.",
    });
  });

  it("hints at the token on 401", () => {
    const rendered = toRenderedError(
      new ManagementApiError(
        401,
        { error: "Unauthorized" },
        "unauthorized",
        "GET https://m/api/v2/me",
      ),
    );
    expect(rendered.body.code).toBe("management_unauthorized");
    expect(rendered.body.hint).toContain("--management-token");
    expect(rendered.exitCode).toBe(3);
  });
});

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
    const error = new MeiliCliError("cli_config", "Index `x` not found.", {
      exitCode: EXIT_CODES.notFound,
      hint: "Run `meili get indexes`.",
    });
    expect(error.exitCode).toBe(4);
    expect(error.toBody().hint).toBe("Run `meili get indexes`.");
  });
});

describe("toRenderedError", () => {
  it("passes Meilisearch API errors through and maps the exit code from the status", () => {
    const notFound = toRenderedError(apiError(404));
    expect(notFound.body).toEqual(apiBody);
    expect(notFound.exitCode).toBe(4);

    const forbidden = toRenderedError(apiError(403));
    expect(forbidden.exitCode).toBe(3);
    expect(forbidden.body.hint).toContain("--project-api-key");

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

  it("strips the terminal colors oclif puts in its messages", () => {
    const rendered = toRenderedError(
      new Errors.CLIError(
        "The following errors occurred:\n  \u001b[2mMissing required flag project\u001b[22m",
      ),
    );
    expect(rendered.body.message).toBe(
      "The following errors occurred:\n  Missing required flag project",
    );
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
    expect(rendered.body.hint).toContain("--help");
    expect(rendered.exitCode).toBe(2);
  });

  it("suggests the closest command when the typo is small, and never asks", () => {
    const commandIds = ["get health", "get indexes", "delete indexes", "schema"];
    const close = toRenderedError(
      new Errors.CLIError("command delete:index not found"),
      commandIds,
    );
    expect(close.body.hint).toBe("Did you mean `meili delete indexes`?");
    expect(
      toRenderedError(new Errors.CLIError("command get:indexs not found"), commandIds).body.hint,
    ).toBe("Did you mean `meili get indexes`?");
    const far = toRenderedError(new Errors.CLIError("command frobnicate not found"), commandIds);
    expect(far.body.hint).toContain("--help");
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
    new MeiliCliError("cli_config", "No URL.", { hint: "Set `MEILI_PROJECT_URL`." }),
  );

  it("prints one compact JSON document", () => {
    expect(formatError(rendered, { pretty: false, debug: false })).toBe(
      '{"error":{"code":"cli_config","type":"cli","message":"No URL.","hint":"Set `MEILI_PROJECT_URL`."}}\n',
    );
  });

  it("indents the JSON when asked", () => {
    const out = formatError(rendered, { pretty: true, debug: false });
    expect(out).toBe(`${JSON.stringify({ error: rendered.body }, null, 2)}\n`);
  });

  it("appends the stack only with debug", () => {
    expect(formatError(rendered, { pretty: false, debug: false })).not.toContain("MeiliCliError");
    expect(formatError(rendered, { pretty: false, debug: true })).toContain("at ");
  });
});

describe("code tables", () => {
  it("maps Management API statuses to codes and exit codes", () => {
    expect(managementErrorCode(401)).toBe("management_unauthorized");
    expect(managementErrorCode(403)).toBe("management_forbidden");
    expect(managementErrorCode(404)).toBe("management_not_found");
    expect(managementErrorCode(422)).toBe("management_unprocessable");
    expect(managementErrorCode(500)).toBe("management_error");
    expect(MANAGEMENT_ERROR_CODES.management_unauthorized).toBe(3);
    expect(MANAGEMENT_ERROR_CODES.management_not_found).toBe(4);
  });

  it("maps Meilisearch API statuses to exit codes", () => {
    expect(meilisearchExitCode(401)).toBe(3);
    expect(meilisearchExitCode(403)).toBe(3);
    expect(meilisearchExitCode(404)).toBe(4);
    expect(meilisearchExitCode(409)).toBe(1);
  });
});
