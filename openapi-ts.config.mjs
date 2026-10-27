/**
 * Read by openapi-ts, which `pnpm gen:management` runs through `pnpm dlx` with
 * TypeScript 5 beside it: the generator drives the TypeScript compiler API,
 * which TypeScript 7 no longer ships, and pnpm resolves a peer dependency from
 * the project, so the generator cannot be a dev dependency here. Hence no
 * import below either. The client throws on an HTTP error and the SDK functions
 * return the body; src/lib/clients/management.ts maps the errors.
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
