#!/usr/bin/env node
/**
 * Downloads the OpenAPI documents the CLI derives its commands from, as JSON
 * into openapi/. They are never committed. See docs/contract/commands.md.
 *
 *   pnpm openapi               both documents (management only if a GitHub token is available)
 *   pnpm openapi:meilisearch        the Meilisearch API document of the latest Meilisearch release,
 *                              or of the release named by MEILISEARCH_VERSION (for example v1.54.2)
 *   pnpm openapi:management    the management document, from the private meilisearch-cloud
 *                              repository: MEILI_BOT_GH_PAT, else GITHUB_TOKEN, else `gh auth token`
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "openapi");
const ENGINE_ASSET = "meilisearch-openapi.json";
const MANAGEMENT_FILE =
  "repos/meilisearch/meilisearch-cloud/contents/api/swagger/v2/swagger.yaml?ref=main";

async function githubFetch(url, accept, token) {
  const headers = { Accept: accept, "User-Agent": "meili-cli-openapi" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`GET ${url} answered HTTP ${response.status}`);
  return response;
}

function save(name, document) {
  if (typeof document?.openapi !== "string" || typeof document?.paths !== "object") {
    throw new Error(`the ${name} document is not an OpenAPI document`);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, `${name}.json`), JSON.stringify(document));
  console.error(
    `openapi/${name}.json: ${name} API ${document.info?.version ?? "?"}, ${Object.keys(document.paths).length} paths`,
  );
}

async function downloadMeilisearch() {
  const tag = process.env.MEILISEARCH_VERSION;
  const release = await githubFetch(
    `https://api.github.com/repos/meilisearch/meilisearch/releases/${tag ? `tags/${tag}` : "latest"}`,
    "application/vnd.github+json",
    process.env.GITHUB_TOKEN,
  ).then((response) => response.json());
  const asset = (release.assets ?? []).find((candidate) => candidate.name === ENGINE_ASSET);
  if (!asset) throw new Error(`release ${release.tag_name} has no ${ENGINE_ASSET} asset`);
  const response = await fetch(asset.browser_download_url);
  if (!response.ok)
    throw new Error(`GET ${asset.browser_download_url} answered HTTP ${response.status}`);
  save("meilisearch", await response.json());
}

function managementToken() {
  if (process.env.MEILI_BOT_GH_PAT) return process.env.MEILI_BOT_GH_PAT;
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    return execFileSync("gh", ["auth", "token"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

async function downloadManagement() {
  const token = managementToken();
  if (!token) {
    console.error(
      "openapi/management.json: skipped, no GitHub token. Run `gh auth login`, or set MEILI_BOT_GH_PAT, to read the private meilisearch-cloud repository.",
    );
    return;
  }
  const response = await githubFetch(
    `https://api.github.com/${MANAGEMENT_FILE}`,
    "application/vnd.github.raw+json",
    token,
  );
  save("management", parseYaml(await response.text()));
}

const downloads = {
  meilisearch: [downloadMeilisearch],
  management: [downloadManagement],
  all: [downloadMeilisearch, downloadManagement],
};
const target = process.argv[2] ?? "all";

try {
  if (!(target in downloads))
    throw new Error(`unknown target \`${target}\`, expected meilisearch, management or all`);
  await Promise.all(downloads[target].map((download) => download()));
} catch (error) {
  console.error(`openapi: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
