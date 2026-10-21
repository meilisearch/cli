/**
 * A stub authorization server that speaks what Doorkeeper speaks on the Cloud:
 * a consent page that redirects back with a code, a token endpoint that checks
 * PKCE and authenticates a public client on its id alone, and the revocation
 * endpoint of RFC 7009. Real sockets, because the flow needs a loopback
 * redirect; msw mocks fetch, not the browser.
 */
import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface AuthorizationServer {
  url: string;
  /** The query the consent page received, to assert what the CLI asked for. */
  authorization: URLSearchParams | undefined;
  /** Tokens the revocation endpoint accepted, and the hint each one carried. */
  revoked: string[];
  hints: string[];
  /** Answer every revocation with 403, as the server does for someone else's token. */
  refuseRevocation: boolean;
  /** Make the server accept this token, as if it had issued it. */
  accept: (token: string) => void;
  close: () => Promise<void>;
}

/** The client id the stub knows, which tests pass as `--management-client-id`. */
export const STUB_CLIENT_ID = "client-uid";

export async function startAuthorizationServer(): Promise<AuthorizationServer> {
  const challenges = new Map<string, string>();
  const accessTokens = new Set<string>();
  let codes = 0;
  const refreshTokens = new Set<string>();
  let issued = 0;

  const state: AuthorizationServer = {
    url: "",
    authorization: undefined,
    revoked: [],
    hints: [],
    refuseRevocation: false,
    accept: () => {},
    close: async () => {},
  };

  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    if (request.method === "GET" && url.pathname === "/oauth/token/info") {
      const token = (request.headers.authorization ?? "").replace(/^Bearer /, "");
      if (!accessTokens.has(token)) {
        json(401, { error: "invalid_token", error_description: "The access token is invalid" });
        return;
      }
      json(200, { resource_owner_id: 1, scope: ["read", "write"], expires_in: 3600 });
      return;
    }

    if (request.method === "GET" && url.pathname === "/oauth/authorize") {
      state.authorization = url.searchParams;
      codes += 1;
      const code = `code-${codes}`;
      challenges.set(code, url.searchParams.get("code_challenge") ?? "");
      const back = new URL(url.searchParams.get("redirect_uri") ?? "");
      back.searchParams.set("code", code);
      back.searchParams.set("state", url.searchParams.get("state") ?? "");
      response.writeHead(302, { location: back.href }).end();
      return;
    }

    void readForm(request).then((form) => {
      if (url.pathname === "/oauth/token") {
        tokenEndpoint(form);
        return;
      }
      if (url.pathname === "/oauth/revoke") {
        revokeEndpoint(form);
        return;
      }
      response.writeHead(404).end();
    });

    function tokenEndpoint(form: URLSearchParams): void {
      if (form.get("client_id") !== STUB_CLIENT_ID) {
        json(400, { error: "invalid_client", error_description: "unknown application" });
        return;
      }
      if (form.get("grant_type") === "refresh_token") {
        if (!refreshTokens.has(form.get("refresh_token") ?? "")) {
          json(400, { error: "invalid_grant", error_description: "unknown refresh token" });
          return;
        }
        issueTokens();
        return;
      }
      const code = form.get("code") ?? "";
      const challenge = challenges.get(code);
      if (challenge === undefined) {
        json(400, { error: "invalid_grant", error_description: "unknown code" });
        return;
      }
      const verifier = form.get("code_verifier") ?? "";
      if (createHash("sha256").update(verifier).digest("base64url") !== challenge) {
        json(400, { error: "invalid_grant", error_description: "PKCE verification failed" });
        return;
      }
      challenges.delete(code);
      issueTokens();
    }

    function issueTokens(): void {
      issued += 1;
      const refreshToken = `refresh-token-${issued}`;
      refreshTokens.add(refreshToken);
      accessTokens.add(`access-token-${issued}`);
      json(200, {
        access_token: `access-token-${issued}`,
        refresh_token: refreshToken,
        token_type: "Bearer",
        expires_in: 3600,
        scope: "read write",
      });
    }

    function revokeEndpoint(form: URLSearchParams): void {
      if (form.get("client_id") !== STUB_CLIENT_ID || state.refuseRevocation) {
        json(403, { error: "unauthorized_client", error_description: "not your token" });
        return;
      }
      const token = form.get("token") ?? "";
      state.revoked.push(token);
      state.hints.push(form.get("token_type_hint") ?? "");
      accessTokens.delete(token);
      refreshTokens.delete(token);
      json(200, {});
    }

    function json(status: number, body: unknown): void {
      response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    }
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  state.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  state.accept = (token) => {
    accessTokens.add(token);
    refreshTokens.add(token);
  };
  state.close = () => new Promise<void>((resolve) => server.close(() => resolve()));
  return state;
}

async function readForm(request: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}
