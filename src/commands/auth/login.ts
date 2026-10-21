import { spawn } from "node:child_process";
import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { logIn, SCOPES } from "../../lib/clients/oauth.js";
import { writeNotice } from "../../lib/errors.js";
import {
  credentialsFilePath,
  resolveOauthClient,
  type Session,
  writeCredentialsFile,
} from "../../lib/session.js";

/** How long the human has to approve before the command gives up. */
const TIMEOUT_MS = 300_000;

export default class AuthLogin extends BaseCommand {
  static api: Api = "none";

  static override description =
    "Log in to Meilisearch Cloud with a browser, and store the token for the management commands.";

  static override examples = [
    "<%= config.bin %> <%= command.id %> --management-client-id <uid>",
    "<%= config.bin %> <%= command.id %> --management-client-id <uid> --output json",
    "<%= config.bin %> <%= command.id %> --management-client-id <uid> --no-browser",
  ];

  static override flags = {
    "management-client-id": Flags.string({
      description: "The OAuth application of this CLI. Also MEILI_MANAGEMENT_CLIENT_ID.",
      helpValue: "<uid>",
    }),
    "management-url": Flags.string({
      description: "Management API base URL, which holds the token endpoint.",
      helpValue: "<url>",
    }),
    "management-dashboard-url": Flags.string({
      description: "Dashboard URL, which hosts the consent page.",
      helpValue: "<url>",
    }),
    browser: Flags.boolean({
      default: true,
      allowNo: true,
      description: "Open the consent page in a browser. --no-browser only prints the URL.",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AuthLogin);
    const client = resolveOauthClient(
      {
        clientId: flags["management-client-id"],
        managementUrl: flags["management-url"],
        dashboardUrl: flags["management-dashboard-url"],
      },
      this.env,
    );

    const tokens = await logIn(client, {
      timeoutMs: TIMEOUT_MS,
      onAuthorizationUrl: (url) => {
        process.stderr.write(`Approve the login for \`${SCOPES}\` at:\n${url}\n`);
        if (flags.browser) openInBrowser(url);
      },
    });

    const session: Session = { ...client, ...tokens };
    const path = credentialsFilePath(this.env);
    writeCredentialsFile(path, session);
    writeNotice(`Logged in for \`${session.scope}\`. The session is in ${path}.`);
  }
}

/** Hands the URL to the desktop. A failure is not one: the URL is on stderr. */
function openInBrowser(url: string): void {
  // An argument array and no shell: a hostile URL cannot become a command.
  const [command, args]: [string, string[]] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  const child = spawn(command, args, { stdio: "ignore", detached: true });
  child.on("error", () => {});
  child.unref();
}
