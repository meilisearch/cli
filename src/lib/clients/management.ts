/** Builds the generated Management API client from resolved credentials. */
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
  client.interceptors.error.use((error, response, request, requestOptions) =>
    response === undefined
      ? new MeiliCliError("cli_network", cannotConnectMessage(options.url, error), { cause: error })
      : new ManagementApiError(response.status, error, request?.url ?? requestOptions.url),
  );
  return client;
}
