import { describe, expect, it } from "vitest";
import ResourceList from "../../../src/commands/resource/list.js";
import {
  managementEnv as env,
  MANAGEMENT_URL,
  managementHandlers,
  type ReceivedRequest,
  resource,
} from "../../helpers/management-handlers.js";
import { server, useMockServer } from "../../helpers/msw.js";
import { runCli, runCommand } from "../../helpers/run-command.js";

useMockServer();

const otherRegion = { ...resource, id: 7, regionId: 2 };

describe("meili resource list", () => {
  it("prints its help without any network call", async () => {
    const result = await runCli(["resource", "list", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("lists the resources in the envelope the API returns, with no paging flag yet", async () => {
    server.use(managementHandlers.listResources([resource, otherRegion]));
    const result = await runCommand(ResourceList, [], { env });
    expect(result).toMatchSnapshot();
  });

  it("passes --region-id to the route", async () => {
    const received: ReceivedRequest[] = [];
    server.use(managementHandlers.listResources([resource, otherRegion], received));
    const result = await runCommand(ResourceList, ["--region-id", "2"], { env });
    expect(result.exitCode).toBe(0);
    expect(received[0]?.url).toBe(`${MANAGEMENT_URL}/api/v2/resources?regionId=2`);
    expect(JSON.parse(result.stdout).results).toEqual([otherRegion]);
  });

  it("fails with cli_auth_missing and exit 3 without a token, before any network call", async () => {
    const result = await runCommand(ResourceList, [], {
      env: { MEILI_MANAGEMENT_URL: MANAGEMENT_URL },
    });
    expect(result).toMatchSnapshot();
  });
});
