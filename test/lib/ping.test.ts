import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { regionLatency } from "../../src/lib/clients/ping.js";
import { server, useMockServer } from "../helpers/msw.js";

useMockServer();

describe("regionLatency", () => {
  it("pings the region three times and returns the median, in milliseconds", async () => {
    let pings = 0;
    server.use(
      http.head("https://ping.fra.meilisearch.io/", () => {
        pings++;
        return new HttpResponse(null, { status: 200 });
      }),
    );
    const latency = await regionLatency("fra.meilisearch.io");
    expect(pings).toBe(3);
    expect(Number.isInteger(latency)).toBe(true);
  });

  it("returns undefined when the region does not answer", async () => {
    server.use(http.head("https://ping.syd.meilisearch.io/", () => HttpResponse.error()));
    expect(await regionLatency("syd.meilisearch.io")).toBeUndefined();
  });
});
