/**
 * Builds the generated Management API client from resolved credentials. The
 * client throws on any answer that is not 2xx, and the error interceptor
 * below turns what it throws into the contract's errors.
 */
import { cannotConnectMessage, ManagementApiError, MeiliCliError } from "../errors.js";
import { type Client, createClient } from "./management/generated/client/index.js";

export type ManagementClient = Client;

export interface ManagementClientOptions {
  url: string;
  token: string;
  /** `meili-cli (v1.2.3)`, sent in the User-Agent header. */
  userAgent: string;
}

/**
 * A non-2xx answer becomes a ManagementApiError carrying the error body the
 * API sent, which the contract passes through (output.md, "Errors"); no answer
 * at all is `cli_network`. The SDK functions then return the body.
 */
export function createManagementClient(options: ManagementClientOptions): ManagementClient {
  const client = createClient({
    baseUrl: options.url,
    auth: options.token,
    headers: { "User-Agent": options.userAgent },
    throwOnError: true,
  });
  client.interceptors.error.use((error, response, request, options) =>
    response === undefined
      ? new MeiliCliError(
          "cli_network",
          cannotConnectMessage(client.getConfig().baseUrl ?? "", error),
          {
            cause: error,
          },
        )
      : new ManagementApiError(response.status, error, request?.url ?? options.url),
  );
  return client;
}
