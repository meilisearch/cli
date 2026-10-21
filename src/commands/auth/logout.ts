import { type Api, BaseCommand } from "../../lib/base-command.js";
import { revokeSession } from "../../lib/clients/oauth.js";
import { MeiliCliError, writeNotice } from "../../lib/errors.js";
import { removeCredentialsFile } from "../../lib/session.js";

export default class AuthLogout extends BaseCommand {
  static api: Api = "none";

  static override description =
    "Revoke the token of `auth login` and forget it. Does nothing when nobody is logged in.";

  static override examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --output json",
  ];

  async run(): Promise<void> {
    const { path, session } = this.credentialsFile();
    if (session === undefined) return;

    try {
      await revokeSession(session);
    } catch (error) {
      if (!(error instanceof MeiliCliError)) throw error;
      // The session is forgotten either way, but the token is still live out there.
      throw new MeiliCliError(
        error.code,
        `${error.message} The credentials file was removed anyway, so the token stays valid until it expires.`,
        { hint: "Revoke it from the Meilisearch Cloud dashboard." },
      );
    } finally {
      removeCredentialsFile(path);
    }
    writeNotice(`Logged out. The session was revoked and ${path} removed.`);
  }
}
