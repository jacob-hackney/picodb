#!/usr/bin/env node

import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import { StorageManager } from "./internal/StorageManager.js";
import envPaths from "env-paths";

const DEFAULT_PAGE_SIZE = 64; // in KB

const argv = yargs(hideBin(process.argv))
  .scriptName("picodb")
  .usage("$0 <command> [options]")
  .strict()
  .demandCommand(1, "You need at least one command before moving on")
  .help()
  .alias("help", "h")
  .alias("version", "v");

argv
  .command(
    "init",
    "Create a new PicoDB database",
    (yargs) => {
      return yargs
        .option("page-size", {
          alias: "s",
          type: "number",
          description: "The size of each page in KB (e.g., 64, 128).",
          default: DEFAULT_PAGE_SIZE,
        })
        .option("overwrite", {
          alias: "o",
          type: "boolean",
          description: "If set, overwrites an existing database file.",
          default: false,
        })
        .option("path", {
          alias: "p",
          type: "string",
          description: "The directory path where the database will be created.",
          default: envPaths("picodb", { suffix: "" }).data,
        });
    },
    createHandler
  )
  .command(
    "config",
    "Set configuration options for the PicoDB database",
    (yargs) => {
      return yargs.command(
        "get",
        "Get all metadata, including those that can't be changed with picodb config set.",
        (yargs) => {
          return yargs.option("path", {
            alias: "p",
            type: "string",
            description: "The database path to get the metadata from",
            default: envPaths("picodb", { suffix: "" }).data,
          });
        },
        async (argv: any): Promise<void> => {
          const data = await StorageManager.getMetadata(argv.path);
          console.log(`Page size: ${data.pageSize / 1024} KB`);
        }
      );
    }
  )
  .command(
    "fix",
    "Fix issues in the PicoDB database, e.g. after a crash or corruption",
    (yargs) => {
      return yargs.option("reset", {
        alias: "r",
        type: "boolean",
        description: "Clear the database and re-commit all transactions.",
        default: false,
      });
    }
  )
  .command(
    "rebuild",
    "Change options that require a full rebuild of the database, e.g. page size. Data will be preserved.",
    (yargs) => {
      return yargs.option("page-size", {
        alias: "s",
        type: "number",
        description: "The size of each page in KB (e.g., 64, 128).",
        default: DEFAULT_PAGE_SIZE,
      });
    }
  )
  .command("move", "Move the database to a new location", (yargs) => {
    return yargs
      .option("new-path", {
        alias: "n",
        type: "string",
        description:
          "The new directory path where the database will be moved to.",
        demandOption: true,
      })
      .option("overwrite", {
        alias: "o",
        type: "boolean",
        description:
          "If set, overwrites an existing database file in the new location.",
        default: false,
      });
  })
  .command(
    "upgrade",
    "Upgrade the database to the latest version",
    (yargs) => {}
  )
  .command(
    "log",
    "Parse the binary log file and print out the contents",
    (yargs) => {
      return yargs
        .option("start", {
          alias: "s",
          type: "number",
          description: "The starting log entry number to parse.",
          default: 0,
        })
        .option("count", {
          alias: "c",
          type: "number",
          description: "The number of log entries to parse.",
          default: 10,
        })
        .option("output", {
          alias: "o",
          type: "string",
          description:
            "The output file path to write the parsed log entries to.",
          default: null,
        });
    }
  )
  .parse();

async function createHandler(argv: any) {
  const dirPath: string = argv.path;
  const pageSizeKB: number = argv.pageSize;
  const overwrite: boolean = argv.overwrite;

  console.log(`Creating a new PicoDB database at ${dirPath}...`);
  console.log(`Page size: ${pageSizeKB} KB`);

  if (overwrite) {
    process.stdout.write(
      "Confirm database overwrite? All existing data will be lost! (y/n): "
    );
    await new Promise<void>((resolve) => {
      process.stdin.once("data", async (data) => {
        const input = data.toString().trim().toLowerCase();
        if (!input.includes("y")) {
          console.log("\nOperation cancelled by user.");
          process.exit(0);
        }
        resolve();
      });
    });
  }

  try {
    await StorageManager.create(pageSizeKB, dirPath, overwrite);
    console.log("\nDatabase successfully created.");
    process.exit(0);
  } catch (err) {
    console.error(`\x1b[1;31mFatal Error:\x1b[0m ${err}`);
  }
}
