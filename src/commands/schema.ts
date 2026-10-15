import { type Command, Flags, toConfiguredId } from "@oclif/core";
import { type Api, BaseCommand } from "../lib/base-command.js";
import { closestCommand, MeiliCliError } from "../lib/errors.js";

/** The statics every command declares beyond oclif's, as the manifest carries them. */
type Loadable = Command.Loadable & {
  api: Api;
  routes: readonly string[];
  keyActions: readonly string[];
};

/** The global flags, projected once: the index prints them, a command never repeats them. */
const GLOBAL_FLAGS = Object.entries(BaseCommand.baseFlags).map(([name, flag]) =>
  describeFlag(name, flag),
);

export default class Schema extends BaseCommand {
  static api: Api = "none";

  static override description =
    "Print one line per command, or one command in full with --command, from the oclif manifest.";

  static override examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --output json",
    '<%= config.bin %> <%= command.id %> --command "get indexes"',
    "<%= config.bin %> <%= command.id %> | jq '.commands[].id'",
  ];

  static override flags = {
    command: Flags.string({
      description:
        "Print this command in full instead of the index: its API, its routes, its key actions, the flags it declares itself and its examples.",
      helpValue: "<command>",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Schema);
    const commands = (this.config.commands as Loadable[]).filter(
      (command) => command.hidden !== true,
    );

    if (flags.command === undefined) {
      await this.output({
        name: this.config.bin,
        version: this.config.version,
        globalFlags: GLOBAL_FLAGS,
        commands: commands
          .map((command) => ({
            id: toConfiguredId(command.id, this.config),
            // The first paragraph only: what follows is a warning the detail carries.
            description: (command.description ?? "").split("\n\n")[0],
            routes: omitEmpty(command.routes),
          }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      });
      return;
    }

    const found = commands.find(
      (command) => toConfiguredId(command.id, this.config) === flags.command,
    );
    if (found === undefined) {
      const closest = closestCommand(
        flags.command,
        commands.map((command) => toConfiguredId(command.id, this.config)),
      );
      throw new MeiliCliError("cli_usage", `\`${flags.command}\` is not a command of meili.`, {
        hint:
          closest === undefined
            ? "Run `meili schema` to see every command."
            : `Did you mean \`meili schema --command "${closest}"\`?`,
      });
    }
    await this.output(await this.describe(found));
  }

  /**
   * One command in full. The manifest describes it, except for the flags: the
   * class separates the flags the command declares itself from the global ones
   * it inherits, which the index already prints. `JSON.stringify` drops the
   * undefined fields.
   */
  private async describe(command: Loadable) {
    const id = toConfiguredId(command.id, this.config);
    // A command with no flags of its own does not set the static at all.
    const own = (await command.load()).flags ?? {};
    return {
      id,
      description: command.description ?? "",
      api: command.api,
      routes: omitEmpty(command.routes),
      async: Object.keys(BaseCommand.waitFlags).every((name) => name in own) || undefined,
      keyActions: omitEmpty(command.keyActions),
      flags: Object.entries(own)
        .filter(([, flag]) => flag.hidden !== true)
        .map(([name, flag]) => describeFlag(name, flag)),
      examples: (command.examples ?? []).map((example) =>
        (typeof example === "string" ? example : example.command)
          .replaceAll("<%= config.bin %>", this.config.bin)
          .replaceAll("<%= command.id %>", id),
      ),
    };
  }
}

/** An empty list is absent from the output rather than printed as `[]`. */
function omitEmpty(list: readonly string[]): readonly string[] | undefined {
  return list.length === 0 ? undefined : list;
}

/** The fields of a flag an agent needs. Absent means false, empty or not applicable. */
function describeFlag(name: string, flag: Command.Flag.Any) {
  return {
    name,
    type: flag.type,
    char: flag.char,
    required: flag.required === true || undefined,
    description: flag.description,
    helpValue: flag.type === "option" ? flag.helpValue : undefined,
    options: flag.type === "option" ? flag.options : undefined,
    dependsOn: flag.dependsOn,
    exclusive: flag.exclusive,
  };
}
