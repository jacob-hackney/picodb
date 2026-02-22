import { homedir } from "node:os";
import nodePath from "node:path";

import type { Command } from "commander";

import { StorageManager } from "../../internal/StorageManager.js";
import { ProgressBar } from "../ProgressBar.js";

export function initCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize PicoDB")
    .argument("[mode]", "Initialization mode (default or advanced)", "default")
    .option("--path <path>", "Optional custom database location", "")
    .action(async (mode: string, args: { path: string }) => {
      if (mode === "advanced") {
        console.warn(
          "Advanced initialization is not implemented yet but will be added in a future release. Falling back to default initialization.",
        );
        mode = "default";
      }

      if (mode === "default") {
        const progress = new ProgressBar(
          "picodb init",
          "Starting initialization...",
        );
        await StorageManager.createDatabaseFiles(
          args.path,
          (percent, message) => progress.update(percent, message),
        );
      } else {
        console.error(
          `error: unknown initialization mode: "${mode}". Supported modes are "default" and "advanced".`,
        );
      }
    });
}
