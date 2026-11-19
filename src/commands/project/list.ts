import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { listProjects } from "../../lib/clients/management/generated/sdk.gen.js";
import { projectStatus, table } from "../../lib/human.js";
import { paint } from "../../lib/output.js";

export default class ProjectList extends BaseCommand {
  static api: Api = "management";

  static routes = ["GET /api/v2/projects"];

  static override description = `List the Meilisearch Cloud projects.

Only the projects the token sees.`;

  static override examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --team-id 12",
    "<%= config.bin %> <%= command.id %> --include-terminated --all",
  ];

  static override flags = {
    "team-id": Flags.integer({
      description: "Only the projects of this team.",
      helpValue: "<id>",
    }),
    "include-terminated": Flags.boolean({
      description: "Also list the terminated projects.",
    }),
    ...BaseCommand.paginationFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ProjectList);
    await this.outputList(
      (query) => listProjects({ client: this.managementClient, query }),
      {
        teamId: flags["team-id"],
        includeTerminated: flags["include-terminated"],
        limit: flags.limit,
        offset: flags.offset,
      },
      flags.all,
      ({ results, total }) =>
        results.length === 0
          ? {
              next: [
                "No projects yet. Create one: meili project add --name <name> --team-id <id> --resource-id <id>",
                `${paint("dim", "Find the ids with")} meili team list ${paint("dim", "and")} meili resource list${paint("dim", ".")}`,
              ],
            }
          : {
              status: [paint("bold", `Showing ${results.length} of ${total} projects`)],
              data: table(
                ["ID", "NAME", "PLAN", "STATUS", "MEILISEARCH", "TEAM_ID", "URL"],
                results.map((project) => [
                  String(project.id),
                  project.name,
                  project.resource.displayName ?? project.resource.plan,
                  projectStatus(project.status),
                  project.msVersion,
                  String(project.teamId),
                  project.url ?? paint("dim", "none yet"),
                ]),
              ),
              next: [
                `${paint("dim", "Simplified view. See one project in full:")} meili project view --id <id>${paint("dim", ". See every field:")} --json${paint("dim", ".")}`,
              ],
            },
    );
  }
}
