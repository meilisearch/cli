/**
 * Read by openapi-ts, run by scripts/gen-management.mjs. No import: the generator
 * is not a dependency of this project. The client throws on an HTTP error and the
 * SDK functions return the body; src/lib/clients/management.ts maps the errors.
 * @type {import("@hey-api/openapi-ts").UserConfig}
 */
export default {
  input: "./openapi/management.json",
  output: {
    path: "src/lib/clients/management/generated",
    importFileExtension: ".js",
    format: false,
    lint: false,
  },
  plugins: [
    { name: "@hey-api/client-fetch", throwOnError: true },
    "@hey-api/typescript",
    { name: "@hey-api/sdk", responseStyle: "data" },
  ],
};
