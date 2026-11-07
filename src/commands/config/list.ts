import { type Api, BaseCommand } from "../../lib/base-command.js";
import { redactBody } from "../../lib/config.js";
import { objectLines } from "../../lib/human.js";
import { paint } from "../../lib/output.js";

export default class ConfigList extends BaseCommand {
  static api: Api = "none";

  static override description = `List the projects of the config file.

Prints the path of the file and its projects, keys masked.`;

  static override examples = [
    "<%= config.bin %> <%= command.id %>",
    "MEILI_CONFIG=./meili.json <%= config.bin %> <%= command.id %>",
  ];

  async run(): Promise<void> {
    const file = this.configFile();
    // Entry by entry: a project named `key` is not a secret.
    const projects = Object.fromEntries(
      Object.entries(file.projects).map(([name, entry]) => [name, redactBody(entry)]),
    );
    await this.output({ path: file.path, projects }, () => {
      const names = Object.keys(projects);
      const status = [`${paint("dim", "Config file:")} ${file.path}`];
      if (names.length === 0) {
        return {
          status,
          next: [`No projects yet. Add one: meili config set --project <name> --project-url <url>`],
        };
      }
      return {
        status,
        // The project names stand out: they are what --project takes.
        data: Object.entries(projects)
          .map(([name, entry]) =>
            [paint(["bold", "cyan"], name), ...objectLines(entry as Record<string, unknown>)].join(
              "\n",
            ),
          )
          .join("\n\n"),
      };
    });
  }
}
