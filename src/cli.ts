#!/usr/bin/env node

import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import { StorageManager } from "./StorageManager.js";

const DEFAULT_PAGE_SIZE = 64; // in KB

const argv = yargs(hideBin(process.argv))
  .strict()
  .demandCommand(1, "You need at least one command before moving on")
  .help()
  .alias("help", "h");

argv
  .command(
    "create",
    "Create a new PicoDB database",
    (yargs) => {
      return yargs
        .option("path", {
          alias: "p",
          type: "string",
          description: "The full path to the new database file.",
          default: "~/.picodb",
        })
        .option("pageSize", {
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
        });
    },
    createHandler
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
    await StorageManager.create(dirPath, pageSizeKB, overwrite);
    console.log("\nDatabase successfully created.");
    process.exit(0);
  } catch (err) {
    console.error(`\x1b[1;31mFatal Error:\x1b[0m ${err}`);
  }
}
