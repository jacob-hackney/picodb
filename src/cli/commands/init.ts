import { Argument, Command } from "commander";

import { StorageManager } from "../../internal/StorageManager.js";
import { ProgressBar } from "../ProgressBar.js";

export function initCommand(program: Command): void {
  program
    .command("init")
    .description("initialize picodb")
    .addArgument(
      new Argument("[mode]", "initialization mode")
        .choices(["default", "advanced"])
        .default("default"),
    )
    .option("--path <path>", "optional custom database location", "~/.picodb")
    .action(async (mode: string, args: { path: string }) => {
      if (mode === "advanced") {
        console.warn(
          "advanced initialization is not implemented yet but will be added in a future release. falling back to default initialization.",
        );
        mode = "default";
      }

      if (mode === "default") {
        const progress = new ProgressBar(
          "picodb init",
          "starting initialization...",
        );
        await StorageManager.createDatabaseFiles(
          args.path,
          (percent, message) => progress.update(percent, message),
        );
      } else {
        console.error(
          `error: unknown initialization mode: "${mode}". supported modes are "default" and "advanced".`,
        );
      }
    });
}
