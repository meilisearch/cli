import { type Command, Flags, toConfiguredId } from "@oclif/core";
import { type Api, BaseCommand } from "../lib/base-command.js";
import { MeiliCliError } from "../lib/errors.js";

/** The custom statics every command declares, as the manifest carries them. */
type Loadable = Command.Loadable & {
  api?: Api;
  routes?: readonly string[];
  keyActions?: readonly string[];
};

/** A flag of the manifest or of `BaseCommand.baseFlags`: the fields both share. */
interface FlagLike {
  type: "boolean" | "option";
  char?: string | undefined;
  required?: boolean | undefined;
  description?: string | undefined;
  helpValue?: string | string[] | undefined;
  options?: readonly string[] | undefined;
  dependsOn?: string[] | undefined;
  exclusive?: string[] | undefined;
  hidden?: boolean | undefined;
}

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
        "Print this command in full instead of the index: its API, its routes, its key actions, its own flags and its examples.",
      helpValue: "<command>",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Schema);
    const commands = (this.config.commands as Loadable[])
      .filter((command) => command.hidden !== true)
      .map((command) => ({ id: toConfiguredId(command.id, this.config), command }))
      .sort((a, b) => a.id.localeCompare(b.id));

    if (flags.command === undefined) {
      await this.output({
        name: this.config.bin,
        version: this.config.version,
        globalFlags: Object.entries(BaseCommand.baseFlags as Record<string, FlagLike>).map(
          ([name, flag]) => describeFlag(name, flag),
        ),
        commands: commands.map(({ id, command }) => ({
          id,
          description: command.description ?? "",
          routes: omitEmpty(command.routes),
        })),
      });
      return;
    }

    const found = commands.find(({ id }) => id === flags.command);
    if (found === undefined) {
      throw new MeiliCliError("cli_usage", `\`${flags.command}\` is not a command of meili.`, {
        hint: "Run `meili schema` to see every command.",
      });
    }
    await this.output(this.describe(found.id, found.command));
  }

  /** One command in full. `JSON.stringify` drops the undefined fields. */
  private describe(id: string, command: Loadable) {
    const flags = Object.entries(command.flags as Record<string, FlagLike>).filter(
      ([name, flag]) => flag.hidden !== true && !repeatsGlobalFlag(name, flag),
    );
    return {
      id,
      description: command.description ?? "",
      api: command.api,
      routes: omitEmpty(command.routes),
      async: flags.some(([name]) => name === "wait"),
      keyActions: omitEmpty(command.keyActions),
      flags: flags.map(([name, flag]) => describeFlag(name, flag)),
      examples: (command.examples ?? []).map((example) =>
        (typeof example === "string" ? example : example.command)
          .replaceAll("<%= config.bin %>", this.config.bin)
          .replaceAll("<%= command.id %>", id),
      ),
    };
  }
}

/** An empty list is absent from the output rather than printed as `[]`. */
function omitEmpty(list: readonly string[] | undefined): readonly string[] | undefined {
  return list === undefined || list.length === 0 ? undefined : list;
}

/**
 * Whether the index already prints this flag as it is. A command that
 * redefines a global flag, `meili config add --project`, required and with its
 * own description, keeps it: only an untouched one is dropped.
 */
function repeatsGlobalFlag(name: string, flag: FlagLike): boolean {
  const global = (BaseCommand.baseFlags as Record<string, FlagLike>)[name];
  return (
    global !== undefined &&
    JSON.stringify(describeFlag(name, global)) === JSON.stringify(describeFlag(name, flag))
  );
}

/** The fields of a flag an agent needs. */
function describeFlag(name: string, flag: FlagLike) {
  return {
    name,
    type: flag.type,
    char: flag.char,
    required: flag.required === true,
    description: flag.description,
    helpValue: flag.type === "option" ? flag.helpValue : undefined,
    options: flag.type === "option" ? flag.options : undefined,
    dependsOn: flag.dependsOn,
    exclusive: flag.exclusive,
  };
}
