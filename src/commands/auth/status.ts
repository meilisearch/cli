import { identify } from "../../lib/analytics.js";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { tokenInfo } from "../../lib/clients/oauth.js";
import { MeiliCliError } from "../../lib/errors.js";
import { ensureFreshSession, sessionUser, writeCredentialsFile } from "../../lib/session.js";

export default class AuthStatus extends BaseCommand {
  static api: Api = "none";

  static override description = `Show the Meilisearch Cloud session.

Says whether a session of \`auth login\` exists, whether the authorization server still accepts it, and who it logs in.`;

  static override examples = ["<%= config.bin %> <%= command.id %>"];

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

    const user = await sessionUser(fresh, this.userAgent);
    // A session written before `auth login` stored the user is identified here (ADR 0019).
    if (fresh.userId === undefined) {
      const userId = await identify(this.env, fresh.managementUrl, async () => user.id);
      if (userId !== undefined) writeCredentialsFile(path, { ...fresh, userId });
    }

    await this.output({
      user,
      managementUrl: fresh.managementUrl,
      scope: info.scope ?? fresh.scope,
      expiresAt: info.expiresAt ?? fresh.expiresAt,
      credentials: path,
    });
  }
}
