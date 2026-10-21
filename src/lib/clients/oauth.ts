/**
 * The OAuth2 authorization code flow with PKCE of `meili auth login`, as
 * RFC 8252 describes it for a native application: the human approves on the
 * consent page of the dashboard, the authorization server sends the code back
 * to a loopback server this process owns, and the code is exchanged for the
 * tokens of the Management API. See ADR 0009.
 *
 * With `meilisearch.ts`, the only files of `src/` that speak HTTP.
 */
import { createHash, randomBytes } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { deepestCauseMessage, MeiliCliError } from "../errors.js";

/** The scopes the CLI asks for: `read` for the GET routes of the API, `write` for the others. */
export const SCOPES = "read write";

const CALLBACK_PATH = "/callback";

export interface OauthClient {
  /** Where the consent page lives: `https://cloud.meilisearch.com`. */
  dashboardUrl: string;
  /** Where the token and revocation endpoints live: `https://api.meilisearch.com`. */
  managementUrl: string;
  /** `uid` of the OAuth application. A public client: a CLI holds no secret. */
  clientId: string;
}

/** A client that holds the tokens of a session: what `revokeSession` and `tokenInfo` act on. */
export type OauthSession = OauthClient & {
  accessToken: string;
  refreshToken?: string | undefined;
};

export interface OauthTokens {
  accessToken: string;
  refreshToken: string | undefined;
  /** When the access token stops being accepted, ISO 8601. */
  expiresAt: string;
  scope: string;
}

export interface LoginOptions {
  /** Receives the URL the human has to open, as soon as the server listens. */
  onAuthorizationUrl: (url: string) => void;
  /** How long the human has to approve, in milliseconds. */
  timeoutMs: number;
}

/**
 * Runs the whole flow and returns the tokens. The caller opens the browser, or
 * leaves that to the human: this function only hands out the URL.
 */
export async function logIn(client: OauthClient, options: LoginOptions): Promise<OauthTokens> {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("base64url");
  const callback = await listenForCode(state, options.timeoutMs);
  try {
    options.onAuthorizationUrl(authorizationUrl(client, callback.redirectUri, state, challenge));
    const code = await callback.code;
    return await postToken(client, {
      grant_type: "authorization_code",
      code,
      redirect_uri: callback.redirectUri,
      code_verifier: verifier,
    });
  } finally {
    callback.close();
  }
}

/** Trades the refresh token for a new pair, which replaces the stored one. */
export function refreshAccessToken(
  client: OauthClient,
  refreshToken: string,
): Promise<OauthTokens> {
  return postToken(client, { grant_type: "refresh_token", refresh_token: refreshToken });
}

/**
 * Revokes both tokens of a session, each with its `token_type_hint` (RFC 7009).
 * The refresh token goes first: a server that cascades revokes the access token
 * with it, and the second call then answers 200 on a token it no longer knows.
 * Throws `cli_network` when the server cannot be reached and `cli_auth_failed`
 * when it refuses, so that the exit code says which one happened.
 */
export async function revokeSession(session: OauthSession): Promise<void> {
  if (session.refreshToken !== undefined) {
    await revokeToken(session, session.refreshToken, "refresh_token");
  }
  await revokeToken(session, session.accessToken, "access_token");
}

async function revokeToken(client: OauthClient, token: string, hint: string): Promise<void> {
  const response = await postForm(client, "/oauth/revoke", { token, token_type_hint: hint });
  if (!response.ok) {
    throw new MeiliCliError("cli_auth_failed", await errorMessage(response));
  }
}

/** What the authorization server grants a token, and until when, as it sees it now. */
export interface TokenInfo {
  scope: string | undefined;
  expiresAt: string | undefined;
}

/**
 * `GET /oauth/token/info`: what the authorization server still knows about the
 * access token of this session, or undefined once it no longer accepts it.
 */
export async function tokenInfo(session: OauthSession): Promise<TokenInfo | undefined> {
  const response = await send(new URL("/oauth/token/info", session.managementUrl).href, {
    headers: { authorization: `Bearer ${session.accessToken}`, accept: "application/json" },
  });
  if (response.status === 401) return undefined;
  if (!response.ok) throw new MeiliCliError("cli_auth_failed", await errorMessage(response));
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return {
    // The token endpoint spells the scopes in one string, this one in an array.
    scope: Array.isArray(body.scope) ? body.scope.join(" ") : undefined,
    expiresAt:
      typeof body.expires_in === "number"
        ? new Date(Date.now() + body.expires_in * 1000).toISOString()
        : undefined,
  };
}

/** The URL of the consent page, which lives on the dashboard and not on the API. */
function authorizationUrl(
  client: OauthClient,
  redirectUri: string,
  state: string,
  challenge: string,
): string {
  const url = new URL("/oauth/authorize", client.dashboardUrl);
  url.search = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return url.href;
}

interface Callback {
  /** `http://127.0.0.1:<port>/callback`, sent as `redirect_uri` and matched by the server. */
  redirectUri: string;
  /** The authorization code, once the browser has been redirected back here. */
  code: Promise<string>;
  /** Stops the loopback server. */
  close: () => void;
}

/**
 * Starts the loopback server and resolves once it listens, so that the URL the
 * caller shows already carries its port. Only `127.0.0.1` is bound: nothing on
 * the network can reach it, and the code never leaves the machine.
 */
async function listenForCode(state: string, timeoutMs: number): Promise<Callback> {
  let succeed: (code: string) => void = () => {};
  let fail: (error: MeiliCliError) => void = () => {};
  const code = new Promise<string>((resolve, reject) => {
    succeed = resolve;
    fail = reject;
  });

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== CALLBACK_PATH) {
      response.writeHead(404).end();
      return;
    }
    // The state first, on an error response too (RFC 6749, section 10.12): anything
    // else on this machine can reach this port and would otherwise end the login.
    if (url.searchParams.get("state") !== state) {
      reply(response, "Unexpected request. Go back to your terminal.");
      return;
    }
    const error = url.searchParams.get("error");
    if (error !== null) {
      reply(response, "Authorization refused. Go back to your terminal.");
      fail(
        new MeiliCliError(
          "cli_auth_failed",
          `The authorization server refused: ${url.searchParams.get("error_description") ?? error}.`,
        ),
      );
      return;
    }
    const received = url.searchParams.get("code");
    if (received === null) {
      reply(response, "Something went wrong. Go back to your terminal.");
      fail(
        new MeiliCliError(
          "cli_auth_failed",
          "The authorization server came back without an authorization code.",
        ),
      );
      return;
    }
    reply(response, "You are logged in. Go back to your terminal.");
    succeed(received);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", (error: NodeJS.ErrnoException) => {
      reject(
        new MeiliCliError("cli_network", `Cannot listen on 127.0.0.1: ${error.message}`, {
          hint: "The login needs a loopback port to receive its authorization code.",
        }),
      );
    });
    server.listen(0, "127.0.0.1", resolve);
  });
  const timer = setTimeout(() => {
    fail(
      new MeiliCliError(
        "cli_timeout",
        `Nobody approved the login within ${Math.round(timeoutMs / 1000)}s.`,
        { hint: "Run `meili auth login` again." },
      ),
    );
  }, timeoutMs);
  timer.unref();

  const close = (): void => {
    clearTimeout(timer);
    server.closeAllConnections();
    server.close();
  };
  return {
    redirectUri: `http://127.0.0.1:${(server.address() as AddressInfo).port}${CALLBACK_PATH}`,
    code,
    close,
  };
}

function reply(response: ServerResponse, message: string): void {
  response
    .writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      // The URL of this page carries the code (RFC 8252, section 8.10).
      "referrer-policy": "no-referrer",
      "cache-control": "no-store",
    })
    .end(`<!doctype html><meta charset="utf-8"><title>Meili CLI</title><p>${message}</p>`);
}

async function postToken(client: OauthClient, form: Record<string, string>): Promise<OauthTokens> {
  const response = await postForm(client, "/oauth/token", form);
  if (!response.ok) {
    throw new MeiliCliError("cli_auth_failed", await errorMessage(response), {
      hint: "Run `meili auth login` to start a new login.",
    });
  }
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const accessToken = body.access_token;
  if (typeof accessToken !== "string") {
    throw new MeiliCliError(
      "cli_auth_failed",
      "The authorization server answered without an access token.",
    );
  }
  const expiresIn = typeof body.expires_in === "number" ? body.expires_in : 0;
  return {
    accessToken,
    refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : undefined,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    scope: typeof body.scope === "string" ? body.scope : SCOPES,
  };
}

/** The client id travels in the body: a public client authenticates with it alone. */
function postForm(
  client: OauthClient,
  path: string,
  form: Record<string, string>,
): Promise<Response> {
  return send(new URL(path, client.managementUrl).href, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ ...form, client_id: client.clientId }).toString(),
  });
}

/** Every request of this file, with the one network failure they share. */
async function send(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    const reason = deepestCauseMessage(error) ?? String(error);
    throw new MeiliCliError(
      "cli_network",
      `Cannot reach the authorization server at ${url}: ${reason}`,
    );
  }
}

/** The `error_description` of RFC 6749, or the status when the body has none. */
async function errorMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const description = body.error_description ?? body.error;
  return typeof description === "string"
    ? `The authorization server refused: ${description}.`
    : `The authorization server answered HTTP ${response.status}.`;
}
