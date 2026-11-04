/**
 * Root and topic help. The root help is the tour of the CLI (ADR 0018): every
 * resource with its commands, grouped by the API they talk to, then the global
 * flags of every command and the environment variables of
 * docs/contract/config.md, so that `meili --help` alone shows what exists and
 * how to configure it.
 */
import { type Command, Help, type Interfaces } from "@oclif/core";
import { type Api, BaseCommand, type LoadableCommand } from "./base-command.js";
import { ENV_VARS } from "./config.js";

/** A command without a route of its own belongs to the CLI, whatever it calls. */
const SECTIONS: [string, Api][] = [
  ["CLI COMMANDS", "none"],
  ["MEILISEARCH COMMANDS", "meilisearch"],
  ["CLOUD MANAGEMENT COMMANDS", "management"],
];

/** The verbs of a resource in this order, then the others. */
const VERB_ORDER = ["list", "view", "add", "update", "delete"];

export default class MeiliHelp extends Help {
  /** The description and the usage. `meili version` and `meili --version` give the version. */
  override formatRoot(): string {
    return [
      this.config.pjson.description ?? "",
      this.section("USAGE", `$ ${this.config.bin} <command> <subcommand> [flags]`),
    ].join("\n\n");
  }

  /** No topic has subtopics, and the root help lists the topics in its sections. */
  protected override get sortedTopics(): Interfaces.Topic[] {
    return [];
  }

  /**
   * oclif calls this with the commands of a topic, whose ids hold a ":", and
   * at the root with the commands that have no topic. The root gets the tour
   * instead: every command, by section.
   */
  protected override formatCommands(commands: Command.Loadable[]): string {
    if (commands.some((command) => command.id.includes(":"))) return super.formatCommands(commands);
    const byName = new Map<string, LoadableCommand[]>();
    for (const command of this.sortedCommands as LoadableCommand[]) {
      const name = command.id.split(":")[0] ?? command.id;
      byName.set(name, [...(byName.get(name) ?? []), command]);
    }
    const sections = SECTIONS.map(([title, api]) => {
      const rows = [...byName]
        .filter(([, group]) => sectionOf(group) === api)
        .map(([name, group]): [string, string] => [
          name,
          group[0]?.id === name ? (this.summary(group[0]) ?? "") : verbs(group),
        ]);
      return this.section(title, this.renderList(rows, { indentation: 2, spacer: "\n" }));
    });
    const variables = ENV_VARS.filter((variable) => variable.development !== true).map(
      (variable): [string, string] => [variable.name, variable.description],
    );
    return [
      ...sections,
      this.section("GLOBAL FLAGS", globalFlagRows()),
      this.section("ENVIRONMENT VARIABLES", variables),
    ].join("\n\n");
  }

  protected override formatTopic(topic: Interfaces.Topic): string {
    // `super` ends with a blank line, and oclif prints the commands of the topic
    // right after this: the section is joined to the trimmed text and keeps the
    // one trailing newline that separates it from them.
    const topicHelp = super.formatTopic(topic).trimEnd();
    return `${topicHelp}\n\n${this.section("GLOBAL FLAGS", globalFlagRows())}\n`;
  }
}

/** The section of a resource: the API of its commands, or the CLI when they have no route. */
function sectionOf(group: LoadableCommand[]): Api {
  return group.some((command) => command.routes.length > 0) ? (group[0]?.api ?? "none") : "none";
}

/** `list, view, add, update, delete, swap`: the commands of a resource. */
function verbs(commands: LoadableCommand[]): string {
  const rank = (verb: string) => {
    const index = VERB_ORDER.indexOf(verb);
    return index === -1 ? VERB_ORDER.length : index;
  };
  return commands
    .map((command) => command.id.split(":")[1] ?? "")
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .join(", ");
}

/** `--debug` and its description, in the order of the contract table. */
function globalFlagRows(): [string, string][] {
  return Object.entries(BaseCommand.baseFlags).map(([name, flag]) => [
    `--${name}`,
    flag.description ?? "",
  ]);
}
