import { type Api, BaseCommand } from "../../lib/base-command.js";
import { tokenInfo } from "../../lib/clients/oauth.js";
import { MeiliCliError } from "../../lib/errors.js";
import { ensureFreshSession } from "../../lib/session.js";

export default class AuthStatus extends BaseCommand {
  static api: Api = "none";

  static override description =
    "Say whether a session of `auth login` exists and whether the authorization server still accepts it.";

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

    // A spent access token is refreshed first, so the answer is what the next
    // command would get, not what the file happens to hold.
    const fresh = await ensureFreshSession(path, session);
    const info = await tokenInfo(fresh);
    if (info === undefined) {
      throw new MeiliCliError(
        "cli_auth_failed",
        "The authorization server no longer accepts this session.",
        { hint: "Run `meili auth login` to log in again." },
      );
    }

    await this.output({
      managementUrl: fresh.managementUrl,
      scope: info.scope ?? fresh.scope,
      expiresAt: info.expiresAt ?? fresh.expiresAt,
      credentials: path,
    });
  }
}
