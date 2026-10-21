import { type Api, BaseCommand } from "../../lib/base-command.js";
import { MeiliCliError, writeNotice } from "../../lib/errors.js";
import { refreshSession } from "../../lib/session.js";

export default class AuthRefresh extends BaseCommand {
  static api: Api = "none";

  static override description =
    "Trade the refresh token of the stored session for a new access token, before it expires.";

  static override examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --output json",
  ];

  async run(): Promise<void> {
    const { path, session } = this.credentialsFile();
    if (session === undefined) {
      throw new MeiliCliError("cli_auth_missing", "Nobody is logged in on this machine.", {
        hint: "Run `meili auth login`.",
      });
    }

    const refreshed = await refreshSession(path, session);
    writeNotice(`Session refreshed. It now expires at ${refreshed.expiresAt}.`);
  }
}
