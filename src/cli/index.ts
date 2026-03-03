#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
const program = new Command("picodb");

program
  .description("The CLI for picodb, a locally stored database made for Node.js")
  .version("1.0.0", "-v, --version", "output the version number");

initCommand(program);

program.parse(process.argv);
