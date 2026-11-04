import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { writeNotice } from "../../lib/errors.js";
import { logInWithBrowser } from "../../lib/login.js";

export default class AuthLogin extends BaseCommand {
  static api: Api = "none";

  static override description =
    "Log in to Meilisearch Cloud with a browser, and store the token for the management commands.";

  static override examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --output json",
    "<%= config.bin %> <%= command.id %> --no-browser",
  ];

  static override flags = {
    browser: Flags.boolean({
      default: true,
      allowNo: true,
      description: "Open the consent page in a browser. --no-browser only prints the URL.",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AuthLogin);
    const { path } = await logInWithBrowser(this.env, flags.browser, this.userAgent);
    writeNotice(`Logged in. The session is in ${path}.`);
  }
}
