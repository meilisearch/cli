import { Flags } from "@oclif/core";
import { type Api, BaseCommand } from "../../lib/base-command.js";
import { getApiV2Resources } from "../../lib/clients/management/generated/sdk.gen.js";

export default class GetResources extends BaseCommand {
  static api: Api = "management";

  static routes = ["GET /api/v2/resources"];

  static override description =
    "List the active Meilisearch Cloud resources, the plans a project runs on, with their pricing.";

  static override examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --output json",
    "<%= config.bin %> <%= command.id %> --region-id 1",
  ];

  static override flags = {
    "region-id": Flags.integer({
      description: "Only the resources of this region.",
      helpValue: "<id>",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(GetResources);
    // One page and no paging flags yet (output.md, "Pagination").
    await this.outputList(
      (query) => getApiV2Resources({ client: this.managementClient, query }),
      { regionId: flags["region-id"] },
      false,
      () => undefined,
    );
  }
}
