/**
 * Builds the generated Management API client from resolved credentials and
 * turns its results into data or contract errors. The generated client never
 * throws on an HTTP error: it returns the parsed body next to the response.
 */
import { cannotConnectMessage, ManagementApiError, MeiliCliError } from "../errors.js";
import { type Client, createClient } from "./management/generated/client/index.js";
import { RESPONSES } from "./management/generated/responses.gen.js";

export type ManagementClient = Client;

export interface ManagementClientOptions {
  url: string;
  token: string;
  /** `meili-cli (v1.2.3)`, sent in the User-Agent header. */
  userAgent: string;
}

export function createManagementClient(options: ManagementClientOptions): ManagementClient {
  return createClient({
    baseUrl: options.url,
    auth: options.token,
    headers: { "User-Agent": options.userAgent },
  });
}

/**
 * What one generated SDK function resolves to, with `throwOnError` off. Not the
 * generated `RequestResult`: that type is keyed by status and does not let `T`
 * be inferred from the call.
 */
export interface ManagementResult<T> {
  data?: T | undefined;
  error?: unknown;
  response?: Response | undefined;
}

/**
 * Runs one request of `route`, `POST /api/v2/projects`, and returns the body
 * of its 2xx answer. Any other status is a ManagementApiError carrying the body
 * and the document's description of that status. A failed connection, which
 * the generated client returns as an error without response, is `cli_network`.
 */
export async function managementRequest<T>(
  client: ManagementClient,
  route: string,
  call: (client: ManagementClient) => Promise<ManagementResult<T>>,
): Promise<T> {
  const { data, error, response } = await call(client);
  if (response === undefined) {
    const where = client.getConfig().baseUrl ?? "the Management API";
    throw new MeiliCliError("cli_network", cannotConnectMessage(where, error), { cause: error });
  }
  if (!response.ok) {
    throw new ManagementApiError(
      response.status,
      error,
      RESPONSES[route]?.[String(response.status)],
    );
  }
  return data as T;
}
