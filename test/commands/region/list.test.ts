import { describe, expect, it } from "vitest";
import RegionList from "../../../src/commands/region/list.js";
import {
  managementEnv as env,
  managementHandlers,
  region,
} from "../../helpers/management-handlers.js";
import { server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

const frankfurt = { ...region, id: 2, name: "Frankfurt", greenLabel: true };

describe("meili region list", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["region", "list", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("lists the regions in the envelope the API returns, with no paging flag yet", async () => {
    server.use(managementHandlers.listRegions([region, frankfurt]));
    const result = await runCommand(RegionList, [], { env });
    expect(result).toMatchSnapshot();
  });

  it("exits 6 on the 401 without a body that the document declares", async () => {
    server.use(managementHandlers.apiError("/api/v2/regions", 401));
    const result = await runCommand(RegionList, [], { env });
    expect(result).toMatchSnapshot();
  });
});
