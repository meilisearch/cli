import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { listResources } from "../../lib/clients/management/generated/sdk.gen.js";

export default class ResourceList extends BaseCommand {
  static api: Api = "management";

  static routes = ["GET /api/v2/resources"];

  static override description = `List the Meilisearch Cloud resources.

The active plans a project runs on, with their pricing.`;

  static override examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --region-id 1",
    "<%= config.bin %> <%= command.id %> --plan resource_based_plan",
  ];

  static override flags = {
    "region-id": Flags.integer({
      description: "Only the resources of this region.",
      helpValue: "<id>",
    }),
    plan: Flags.option({
      options: [
        "legacy",
        "build_plan",
        "pro_plan",
        "custom_plan",
        "grow_plan",
        "free_trial",
        "enterprise_plan",
        "resource_based_plan",
      ] as const,
      description: "Only the resources of this plan.",
    })(),
    ...BaseCommand.paginationFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ResourceList);
    await this.outputList(
      (query) => listResources({ client: this.managementClient, query }),
      {
        regionId: flags["region-id"],
        plan: flags.plan,
        limit: flags.limit,
        offset: flags.offset,
      },
      flags.all,
    );
  }
}
